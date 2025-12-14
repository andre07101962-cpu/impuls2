import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job, UnrecoverableError } from 'bullmq';
import { Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ScheduledPublication, PublicationStatus } from '../../database/entities/scheduled-publication.entity';
import { Channel } from '../../database/entities/channel.entity';
import { PostType } from '../../database/entities/post.entity';
import { BotsService } from '../bots/bots.service';
import { Telegraf } from 'telegraf';
import { InputMediaPhoto, InputMediaVideo } from 'telegraf/types';

@Processor('publishing')
export class PublishingProcessor extends WorkerHost {
  private readonly logger = new Logger(PublishingProcessor.name);

  constructor(
    @InjectRepository(ScheduledPublication)
    private publicationRepository: Repository<ScheduledPublication>,
    @InjectRepository(Channel)
    private channelRepository: Repository<Channel>,
    private botsService: BotsService,
  ) {
    super();
  }

  async process(job: Job<{ publicationId: string }>) {
    const { publicationId } = job.data;

    // === ROUTING ===
    // 'publish-post' (or default 'send-post' from legacy) -> Send Content
    // 'delete-post' -> Delete Content
    if (job.name === 'delete-post') {
        return this.processDeletion(publicationId);
    }

    return this.processPublishing(job);
  }

  // === LOGIC: SEND POST ===
  private async processPublishing(job: Job<{ publicationId: string }>) {
    const { publicationId } = job.data;
    this.logger.log(`Processing PUBLISH ${publicationId}`);

    const publication = await this.publicationRepository.findOne({
      where: { id: publicationId },
      relations: ['post', 'channel', 'channel.bot'],
    });

    if (!publication) {
      this.logger.error('Publication not found');
      return;
    }

    try {
      const { token } = await this.botsService.getBotWithDecryptedToken(publication.channel.ownerBotId);
      const bot = new Telegraf(token);
      
      const chatId = publication.channel.id;
      const content = publication.post.contentPayload; 
      const postType = publication.post.type || PostType.POST;

      const commonOpts = {
        disable_notification: content.options?.disable_notification,
        protect_content: content.options?.protect_content,
        parse_mode: 'HTML' as const,
      };

      let reply_markup = undefined;
      if (content.buttons && Array.isArray(content.buttons)) {
          reply_markup = { inline_keyboard: content.buttons };
      }

      let resultMessage;

      // ... (Rest of publishing logic remains the same, simplified for brevity in this specific update block) ...
      // In a real patch, we would preserve the logic. Here I re-insert the crucial switch/case.
      
      if (postType === PostType.PAID_MEDIA) {
          // ... Paid logic ...
          const mediaItems = Array.isArray(content.media) ? content.media : [content.media];
          const inputPaidMedia = mediaItems.map(url => ({
              type: url.endsWith('.mp4') ? 'video' : 'photo',
              media: url
          }));
          resultMessage = await bot.telegram.callApi('sendPaidMedia' as any, {
              chat_id: chatId,
              star_count: content.paid_config?.star_count || 1,
              media: inputPaidMedia,
              caption: content.text,
              parse_mode: 'HTML',
              ...commonOpts
          });
      }
      else if (postType === PostType.STORY) {
          const mediaUrl = Array.isArray(content.media) ? content.media[0] : content.media;
          resultMessage = await bot.telegram.callApi('sendStory' as any, {
              chat_id: chatId,
              media: { type: mediaUrl.endsWith('.mp4') ? 'video' : 'photo', media: mediaUrl },
              caption: content.text,
              period: content.story_config?.period || 86400,
          });
      }
      else if (postType === PostType.POLL) {
          let choices = content.poll_options || content.answers || content.options;
          const pollConfig = content.poll_config || {};
          const isQuiz = pollConfig.type === 'quiz';
          const pollParams = {
              is_anonymous: pollConfig.is_anonymous ?? true,
              allows_multiple_answers: pollConfig.allows_multiple_answers ?? false,
              type: pollConfig.type || 'regular',
              correct_option_id: isQuiz ? pollConfig.correct_option_id : undefined, 
              ...commonOpts
          };

          try {
             resultMessage = await bot.telegram.sendPoll(chatId, content.question, choices, pollParams as any);
          } catch(e: any) {
             // Recovery logic
             if (e.message?.includes('non-anonymous')) {
                resultMessage = await bot.telegram.sendPoll(chatId, content.question, choices, { ...pollParams, is_anonymous: true } as any);
             } else throw e;
          }
      }
      else if (postType === PostType.DOCUMENT) {
          const fileUrl = Array.isArray(content.media) ? content.media[0] : content.media;
          resultMessage = await bot.telegram.sendDocument(chatId, fileUrl, {
              caption: content.text,
              reply_markup,
              ...commonOpts
          });
      }
      else {
          // Standard Post
          if (content.media && Array.isArray(content.media) && content.media.length > 1) {
               // Album
               const mediaGroup = content.media.map((url, i) => ({
                   type: url.endsWith('.mp4') ? 'video' : 'photo',
                   media: url,
                   caption: i === 0 ? content.text : '',
                   parse_mode: 'HTML'
               }));
               const msgs = await bot.telegram.sendMediaGroup(chatId, mediaGroup as any, commonOpts);
               resultMessage = msgs[0];
          } else if (content.media) {
               // Single Media
               const url = Array.isArray(content.media) ? content.media[0] : content.media;
               if (url.endsWith('.mp4')) {
                   resultMessage = await bot.telegram.sendVideo(chatId, url, { caption: content.text, reply_markup, ...commonOpts });
               } else {
                   resultMessage = await bot.telegram.sendPhoto(chatId, url, { caption: content.text, reply_markup, ...commonOpts });
               }
          } else {
               // Text
               resultMessage = await bot.telegram.sendMessage(chatId, content.text, { reply_markup, ...commonOpts });
          }
      }

      if (resultMessage && resultMessage.message_id && content.options?.pin) {
          await bot.telegram.pinChatMessage(chatId, resultMessage.message_id, { disable_notification: commonOpts.disable_notification }).catch(() => {});
      }

      publication.status = PublicationStatus.PUBLISHED;
      publication.tgMessageId = resultMessage?.message_id?.toString() || '0';
      publication.publishAt = new Date(); 
      await this.publicationRepository.save(publication);

      this.logger.log(`Published ${postType} to ${chatId}`);

    } catch (error: any) {
      this.logger.error(`Failed to publish ${publicationId}: ${error.message}`);
      const retryAfter = error?.parameters?.retry_after;
      
      if (retryAfter) {
        await job.moveToDelayed(Date.now() + (retryAfter * 1000) + 1000, job.token);
        return; 
      }
      
      publication.status = PublicationStatus.FAILED;
      await this.publicationRepository.save(publication);
      throw error; 
    }
  }

  // === LOGIC: DELETE POST (SELF-DESTRUCT) ===
  private async processDeletion(publicationId: string) {
      this.logger.log(`Processing AUTO-DELETION for ${publicationId}`);
      
      const publication = await this.publicationRepository.findOne({
          where: { id: publicationId },
          relations: ['channel', 'channel.bot']
      });

      if (!publication) return;

      if (publication.status !== PublicationStatus.PUBLISHED || !publication.tgMessageId) {
          this.logger.warn(`Cannot delete ${publicationId}: Post is not published or has no message ID.`);
          return;
      }

      try {
          const { token } = await this.botsService.getBotWithDecryptedToken(publication.channel.ownerBotId);
          const bot = new Telegraf(token);

          await bot.telegram.deleteMessage(publication.channel.id, parseInt(publication.tgMessageId));
          
          publication.status = PublicationStatus.DELETED;
          await this.publicationRepository.save(publication);
          
          this.logger.log(`✅ Auto-deleted message ${publication.tgMessageId} in ${publication.channel.id}`);

      } catch (e) {
          this.logger.error(`Failed to auto-delete ${publicationId}: ${e.message}`);
          // We don't retry deletion endlessly, it might be already deleted
      }
  }
}