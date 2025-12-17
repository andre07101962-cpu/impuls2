
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ScheduledPublication, PublicationStatus } from '../../database/entities/scheduled-publication.entity';
import { Channel } from '../../database/entities/channel.entity';
import { PostType } from '../../database/entities/post.entity';
import { BotsService } from '../bots/bots.service';
import { Telegraf } from 'telegraf';

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
    if (job.name === 'delete-post') {
        return this.processDeletion(publicationId);
    }
    return this.processPublishing(job);
  }

  private async processPublishing(job: Job<{ publicationId: string }>) {
    const { publicationId } = job.data;

    const publication = await this.publicationRepository.findOne({
      where: { id: publicationId },
      relations: ['post', 'channel', 'channel.bot'],
    });

    if (!publication) {
      this.logger.error('Publication not found (Deleted?)');
      return;
    }

    try {
      const { token } = await this.botsService.getBotWithDecryptedToken(publication.channel.ownerBotId);
      const bot = new Telegraf(token);
      
      const channel = publication.channel;
      // 🚀 TARGETING: Topic support
      let targetChatId = channel.id;
      let messageThreadId = undefined;

      const content = publication.post.contentPayload; 
      
      if (content.options?.topic_id) {
         if (!channel.linkedChatId && !channel.isForum) {
            // For channels with discussion groups OR forum supergroups
             // Note: API allows posting to topic in the channel ID if it's a forum
         }
         // Prioritize using the channel ID itself if it is a forum, otherwise linked group
         targetChatId = channel.isForum ? channel.id : (channel.linkedChatId || channel.id);
         messageThreadId = content.options.topic_id;
      }

      const postType = publication.post.type || PostType.POST;

      const commonOpts: any = {
        disable_notification: content.options?.disable_notification,
        protect_content: content.options?.protect_content,
        message_thread_id: messageThreadId,
        parse_mode: 'HTML',
      };

      if (content.options?.has_spoiler) commonOpts.has_spoiler = true;
      if (content.options?.message_effect_id) commonOpts.message_effect_id = content.options.message_effect_id;
      if (content.options?.show_caption_above_media) commonOpts.show_caption_above_media = true;

      // Handle reply_to_message_id if present in options (Future proofing)
      if (content.options?.reply_to_message_id) commonOpts.reply_to_message_id = content.options.reply_to_message_id;

      let reply_markup = undefined;
      if (content.buttons && Array.isArray(content.buttons)) {
          reply_markup = { inline_keyboard: content.buttons };
      }

      let resultMessage;
      const mediaOne = Array.isArray(content.media) ? content.media[0] : content.media;

      // --- DISPATCHER LOGIC ---
      switch (postType) {
          case PostType.COPY:
               // "Steal" content (No forward label)
               resultMessage = await bot.telegram.copyMessage(targetChatId, content.from_chat_id, content.message_id, {
                   caption: content.text, // Optional override
                   reply_markup,
                   ...commonOpts
               });
               break;

          case PostType.FORWARD:
               // Repost (With forward label)
               resultMessage = await bot.telegram.forwardMessage(targetChatId, content.from_chat_id, content.message_id, {
                   disable_notification: commonOpts.disable_notification,
                   message_thread_id: commonOpts.message_thread_id,
                   protect_content: commonOpts.protect_content
               });
               break;

          case PostType.LOCATION:
               resultMessage = await bot.telegram.sendLocation(targetChatId, content.latitude, content.longitude, {
                   live_period: content.live_period,
                   reply_markup,
                   ...commonOpts
               });
               break;

          case PostType.CONTACT:
               resultMessage = await bot.telegram.sendContact(targetChatId, content.phone_number, content.first_name, {
                   last_name: content.last_name,
                   vcard: content.vcard,
                   reply_markup,
                   ...commonOpts
               });
               break;

          case PostType.STICKER:
               resultMessage = await bot.telegram.sendSticker(targetChatId, mediaOne, {
                   emoji: content.emoji,
                   reply_markup,
                   ...commonOpts
               });
               break;

          case PostType.VOICE:
               resultMessage = await bot.telegram.sendVoice(targetChatId, mediaOne, {
                   caption: content.text,
                   duration: content.duration,
                   reply_markup,
                   ...commonOpts
               });
               break;

          case PostType.AUDIO:
               resultMessage = await bot.telegram.sendAudio(targetChatId, mediaOne, {
                   caption: content.text,
                   performer: content.performer,
                   title: content.title,
                   thumbnail: content.thumbnail, // URL or File ID
                   reply_markup,
                   ...commonOpts
               });
               break;

          case PostType.VIDEO_NOTE:
               // "Circle" video
               resultMessage = await bot.telegram.sendVideoNote(targetChatId, mediaOne, {
                   duration: content.duration,
                   length: content.length, // Diameter
                   thumbnail: content.thumbnail,
                   reply_markup,
                   ...commonOpts
               });
               break;

          case PostType.PAID_MEDIA:
              const mediaItems = Array.isArray(content.media) ? content.media : [content.media];
              const inputPaidMedia = mediaItems.map((url: string) => ({
                  type: url.endsWith('.mp4') ? 'video' : 'photo',
                  media: url
              }));
              resultMessage = await bot.telegram.callApi('sendPaidMedia' as any, {
                  chat_id: targetChatId,
                  star_count: content.paid_config?.star_count || 1,
                  media: inputPaidMedia,
                  caption: content.text,
                  payload: content.payload, // Optional internal payload
                  ...commonOpts
              });
              break;

          case PostType.STORY:
              if (messageThreadId) throw new Error('Cannot post Stories to a Topic.');
              resultMessage = await bot.telegram.callApi('sendStory' as any, {
                  chat_id: targetChatId,
                  media: { type: mediaOne.endsWith('.mp4') ? 'video' : 'photo', media: mediaOne },
                  caption: content.text,
                  period: content.story_config?.period || 86400,
              });
              break;

          case PostType.POLL:
              let choices = content.poll_options || content.answers || content.options;
              const pollConfig = content.poll_config || {};
              const isQuiz = pollConfig.type === 'quiz';
              resultMessage = await bot.telegram.sendPoll(targetChatId, content.question, choices, {
                  is_anonymous: pollConfig.is_anonymous ?? true,
                  allows_multiple_answers: pollConfig.allows_multiple_answers ?? false,
                  type: pollConfig.type || 'regular',
                  correct_option_id: isQuiz ? pollConfig.correct_option_id : undefined,
                  explanation: pollConfig.explanation,
                  open_period: pollConfig.open_period,
                  close_date: pollConfig.close_date,
                  ...commonOpts
              } as any);
              break;

          case PostType.DOCUMENT:
              resultMessage = await bot.telegram.sendDocument(targetChatId, mediaOne, {
                  caption: content.text,
                  thumbnail: content.thumbnail,
                  reply_markup,
                  ...commonOpts
              });
              break;

          default: // PostType.POST
              if (content.media && Array.isArray(content.media) && content.media.length > 1) {
                   // Album
                   const mediaGroup = content.media.map((url: string, i: number) => ({
                       type: url.endsWith('.mp4') ? 'video' : 'photo',
                       media: url,
                       caption: i === 0 ? content.text : '', // Caption only on first item
                       parse_mode: 'HTML',
                       has_spoiler: commonOpts.has_spoiler
                   }));
                   
                   // Fix: use reply_parameters for sendMediaGroup as reply_to_message_id is not supported in options type
                   const mediaGroupOpts: any = {
                       disable_notification: commonOpts.disable_notification,
                       message_thread_id: commonOpts.message_thread_id,
                       protect_content: commonOpts.protect_content,
                   };
                   if (commonOpts.reply_to_message_id) {
                       mediaGroupOpts.reply_parameters = { message_id: commonOpts.reply_to_message_id };
                   }

                   const msgs = await bot.telegram.sendMediaGroup(targetChatId, mediaGroup as any, mediaGroupOpts);
                   resultMessage = msgs[0]; // Store ID of first message
              } else if (content.media) {
                   // Single Media
                   const url = mediaOne;
                   if (url.endsWith('.mp4')) {
                       resultMessage = await bot.telegram.sendVideo(targetChatId, url, { caption: content.text, reply_markup, ...commonOpts });
                   } else {
                       resultMessage = await bot.telegram.sendPhoto(targetChatId, url, { caption: content.text, reply_markup, ...commonOpts });
                   }
              } else {
                   // Text Only
                   resultMessage = await bot.telegram.sendMessage(targetChatId, content.text, { reply_markup, link_preview_options: content.link_preview_options, ...commonOpts });
              }
              break;
      }

      // --- POST-PROCESSING ---

      // 1. Pin Message
      if (resultMessage && resultMessage.message_id && content.options?.pin) {
          await bot.telegram.pinChatMessage(targetChatId, resultMessage.message_id, { disable_notification: commonOpts.disable_notification }).catch(() => {});
      }

      // 2. Set Reactions (Engagement)
      if (resultMessage && resultMessage.message_id && content.options?.reactions && Array.isArray(content.options.reactions)) {
          // reactions: [{ type: 'emoji', emoji: '🔥' }]
          await bot.telegram.setMessageReaction(targetChatId, resultMessage.message_id, content.options.reactions).catch(e => this.logger.warn(`Failed to set reaction: ${e.message}`));
      }

      publication.status = PublicationStatus.PUBLISHED;
      publication.tgMessageId = resultMessage?.message_id?.toString() || (resultMessage as any)?.id?.toString() || '0'; // Handle Story ID
      publication.publishAt = new Date(); 
      await this.publicationRepository.save(publication);

      this.logger.log(`✅ PUBLISHED: ${postType} -> ${targetChatId} [MsgID: ${publication.tgMessageId}]`);

    } catch (error: any) {
      
      const retryAfter = error?.parameters?.retry_after;
      if (retryAfter) {
        this.logger.warn(`🛑 FloodWait on Publish (Chat ${publication.channelId}). Pausing for ${retryAfter}s`);
        await job.moveToDelayed(Date.now() + (retryAfter * 1000) + 1000, job.token);
        return; 
      }

      const errCode = error?.response?.error_code;
      if (errCode === 400 || errCode === 403 || errCode === 401) {
          this.logger.error(`❌ FATAL: ${error.message}. Marking FAILED.`);
          publication.status = PublicationStatus.FAILED;
          await this.publicationRepository.save(publication);
          return; 
      }
      
      this.logger.error(`⚠️ Temporary Fail: ${error.message}`);
      throw error; 
    }
  }

  private async processDeletion(publicationId: string) {
      const publication = await this.publicationRepository.findOne({
          where: { id: publicationId },
          relations: ['channel', 'channel.bot', 'post']
      });

      if (!publication || !publication.tgMessageId) return;

      try {
          const { token } = await this.botsService.getBotWithDecryptedToken(publication.channel.ownerBotId);
          const bot = new Telegraf(token);
          
          let targetChatId = publication.channel.id;
          if (publication.post.contentPayload?.options?.topic_id && publication.channel.linkedChatId) {
             // For deletion, if it was sent to linked group via topic, we need that ID? 
             // Actually, for Deletion, usually Channel ID works if bot is admin.
             // But if it's a forum topic in a supergroup:
             targetChatId = publication.channel.isForum ? publication.channel.id : (publication.channel.linkedChatId || publication.channel.id);
          }

          await bot.telegram.deleteMessage(targetChatId, parseInt(publication.tgMessageId));
          
          publication.status = PublicationStatus.DELETED;
          await this.publicationRepository.save(publication);
      } catch (e) {
          publication.status = PublicationStatus.DELETED;
          await this.publicationRepository.save(publication);
      }
  }
}
