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

@Processor('publishing', {
  limiter: {
    max: 20,
    duration: 1000,
  },
})
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
    this.logger.log(`Processing publication ${publicationId}`);

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

      // Common Options (Silent, Protect Content)
      const commonOpts = {
        disable_notification: content.options?.disable_notification,
        protect_content: content.options?.protect_content,
        parse_mode: 'HTML' as const,
      };

      // Inline Keyboard
      let reply_markup = undefined;
      if (content.buttons && Array.isArray(content.buttons)) {
          reply_markup = { inline_keyboard: content.buttons };
      }

      let resultMessage;

      // === LOGIC BRANCHING ===

      // 1. PAID MEDIA (Telegram Stars)
      if (postType === PostType.PAID_MEDIA) {
        if (!content.media || !content.paid_config?.star_count) {
            throw new Error('Paid Media requires media and star_count');
        }
        
        const mediaItems = Array.isArray(content.media) ? content.media : [content.media];
        // Note: sendPaidMedia supports Photo and Video
        const inputPaidMedia = mediaItems.map(url => ({
            type: url.endsWith('.mp4') ? 'video' : 'photo',
            media: url
        }));

        // Raw Call (Telegraf types might lag behind API 7.x/8.x)
        resultMessage = await bot.telegram.callApi('sendPaidMedia' as any, {
            chat_id: chatId,
            star_count: content.paid_config.star_count,
            media: inputPaidMedia,
            caption: content.text,
            parse_mode: 'HTML',
            ...commonOpts
        });
      }

      // 2. STORIES (New in API 7.x)
      else if (postType === PostType.STORY) {
          if (!content.media) throw new Error('Stories require media');
          
          const mediaUrl = Array.isArray(content.media) ? content.media[0] : content.media;
          const isVideo = mediaUrl.endsWith('.mp4');

          // Raw Call for sendStory
          resultMessage = await bot.telegram.callApi('sendStory' as any, {
              chat_id: chatId,
              media: {
                  type: isVideo ? 'video' : 'photo',
                  media: mediaUrl
              },
              caption: content.text,
              period: content.story_config?.period || 86400, // 24h default
              protect_content: content.options?.protect_content
          });
      }

      // 3. POLLS (New!)
      else if (postType === PostType.POLL) {
          if (!content.question || !content.options || content.options.length < 2) {
              throw new Error('Polls require a question and at least 2 options');
          }

          const pollConfig = content.poll_config || {};
          
          resultMessage = await bot.telegram.sendPoll(chatId, content.question, content.options, {
              is_anonymous: pollConfig.is_anonymous ?? true,
              allows_multiple_answers: pollConfig.allows_multiple_answers ?? false,
              type: pollConfig.type || 'regular',
              correct_option_id: pollConfig.correct_option_id, // Only for quiz
              ...commonOpts
          } as any);
      }

      // 4. DOCUMENTS (New!)
      else if (postType === PostType.DOCUMENT) {
          if (!content.media) throw new Error('Document post requires a file URL (media)');
          
          const fileUrl = Array.isArray(content.media) ? content.media[0] : content.media;
          
          resultMessage = await bot.telegram.sendDocument(chatId, fileUrl, {
              caption: content.text,
              reply_markup,
              parse_mode: 'HTML',
              disable_notification: commonOpts.disable_notification,
              protect_content: commonOpts.protect_content
          });
      }

      // 5. STANDARD POSTS
      else {
        // A. Media Group (Album)
        if (content.media && Array.isArray(content.media) && content.media.length > 1) {
            const mediaGroup: (InputMediaPhoto | InputMediaVideo)[] = content.media.map((url, index) => {
                const isVideo = url.endsWith('.mp4');
                return {
                    type: isVideo ? 'video' : 'photo',
                    media: url,
                    caption: index === 0 ? content.text : '', // Caption on first item
                    parse_mode: 'HTML',
                    has_spoiler: content.options?.has_spoiler
                };
            });
            
            const msgs = await bot.telegram.sendMediaGroup(chatId, mediaGroup, {
                disable_notification: commonOpts.disable_notification,
                protect_content: commonOpts.protect_content
            });
            resultMessage = msgs[0]; // Capture first message for ID
        } 
        
        // B. Single Video
        else if (content.media && (
            (typeof content.media === 'string' && content.media.endsWith('.mp4')) || 
            (Array.isArray(content.media) && content.media[0].endsWith('.mp4'))
        )) {
            const videoUrl = Array.isArray(content.media) ? content.media[0] : content.media;
            resultMessage = await bot.telegram.sendVideo(chatId, videoUrl, {
                caption: content.text,
                reply_markup,
                has_spoiler: content.options?.has_spoiler,
                ...commonOpts
            });
        }

        // C. Single Photo
        else if (content.media) {
            const photoUrl = Array.isArray(content.media) ? content.media[0] : content.media;
            resultMessage = await bot.telegram.sendPhoto(chatId, photoUrl, {
                caption: content.text,
                reply_markup,
                has_spoiler: content.options?.has_spoiler,
                ...commonOpts
            } as any);
        } 
        
        // D. Text Only
        else {
            resultMessage = await bot.telegram.sendMessage(chatId, content.text, {
                reply_markup,
                link_preview_options: { is_disabled: false }, // Explicitly enable previews
                ...commonOpts
            });
        }
      }

      // === POST-PUBLISHING ACTIONS ===

      // Handle Pinning
      if (resultMessage && resultMessage.message_id && content.options?.pin) {
          try {
              await bot.telegram.pinChatMessage(chatId, resultMessage.message_id, {
                  disable_notification: commonOpts.disable_notification
              });
              this.logger.log(`Pinned message ${resultMessage.message_id} in ${chatId}`);
          } catch (pinError) {
              this.logger.warn(`Failed to pin message: ${pinError.message}`);
          }
      }

      // === SUCCESS STATE ===
      publication.status = PublicationStatus.PUBLISHED;
      // Stories/PaidMedia return different objects, but usually contain message_id (or similar identifier)
      publication.tgMessageId = resultMessage?.message_id?.toString() || '0';
      publication.publishAt = new Date(); 
      await this.publicationRepository.save(publication);

      this.logger.log(`Published ${postType} to ${chatId}`);

    } catch (error: any) {
      this.logger.error(`Failed to publish ${publicationId}: ${error.message}`);
      const retryAfter = error?.parameters?.retry_after;
      
      if (retryAfter) {
        this.logger.warn(`Telegram Rate Limit. Retrying in ${retryAfter}s`);
        await job.moveToDelayed(Date.now() + (retryAfter * 1000) + 1000, job.token);
        return; 
      }

      if (error.response && error.response.error_code === 403) {
        this.logger.warn(`Bot kicked from channel ${publication.channel.id}`);
        await this.channelRepository.update(publication.channel.id, { isActive: false });
        publication.status = PublicationStatus.FAILED;
        await this.publicationRepository.save(publication);
        throw new UnrecoverableError('Bot kicked');
      }
      
      publication.status = PublicationStatus.FAILED;
      await this.publicationRepository.save(publication);
      throw error; 
    }
  }
}