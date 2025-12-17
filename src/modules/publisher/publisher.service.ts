
import { Injectable, BadRequestException, InternalServerErrorException, Logger, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, Not } from 'typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue, Job } from 'bullmq';
import { Post, PostType } from '../../database/entities/post.entity';
import { ScheduledPublication, PublicationStatus } from '../../database/entities/scheduled-publication.entity';
import { Channel } from '../../database/entities/channel.entity';
import { BotsService } from '../bots/bots.service';
import { Telegraf } from 'telegraf';

@Injectable()
export class PublisherService {
  private readonly logger = new Logger(PublisherService.name);

  constructor(
    @InjectRepository(Post)
    private postRepository: Repository<Post>,
    @InjectRepository(ScheduledPublication)
    private publicationRepository: Repository<ScheduledPublication>,
    @InjectRepository(Channel)
    private channelRepository: Repository<Channel>,
    @InjectQueue('publishing') private publishingQueue: Queue,
    private botsService: BotsService,
  ) {}

  async getPublicationsByUser(userId: string) {
    return this.publicationRepository.find({
      where: {
        channel: {
          bot: {
            userId: userId
          }
        }
      },
      relations: ['channel', 'post'],
      order: {
        publishAt: 'DESC',
      },
      take: 200
    });
  }

  async schedulePost(content: any, channelIds: string[], publishAtIso: string, deleteAtIso?: string) {
    this.logger.log(`Incoming Schedule Request for ${channelIds.length} channels`);

    try {
        const publishDate = new Date(publishAtIso);
        if (isNaN(publishDate.getTime())) throw new BadRequestException('Invalid date format for publishAt');

        let deleteDate = null;
        if (deleteAtIso) {
            deleteDate = new Date(deleteAtIso);
            if (isNaN(deleteDate.getTime())) throw new BadRequestException('Invalid date format for deleteAt');
            if (deleteDate <= publishDate) throw new BadRequestException('Delete time must be after publish time');
        }

        const type = (content.type && Object.values(PostType).includes(content.type)) 
            ? content.type 
            : PostType.POST;

        const post = this.postRepository.create({
          contentPayload: content,
          type: type, 
          name: `${type.toUpperCase()} ${new Date().toISOString()}`,
        });
        await this.postRepository.save(post);

        const cleanChannelIds = channelIds.map(id => String(id));
        const channels = await this.channelRepository.findBy({ id: In(cleanChannelIds) });

        if (channels.length !== cleanChannelIds.length) {
            throw new BadRequestException(`Some channels were not found.`);
        }

        const publications = [];
        
        for (const channel of channels) {
          if (!channel.isActive) continue;

          const pub = this.publicationRepository.create({
            post,
            channel,
            publishAt: publishDate,
            deleteAt: deleteDate,
            status: PublicationStatus.SCHEDULED,
          });
          await this.publicationRepository.save(pub);
          
          await this.scheduleJob(pub, 'publish', publishDate);
          
          if (deleteDate) {
              await this.scheduleJob(pub, 'delete', deleteDate);
          }
              
          publications.push(pub);
        }

        return {
          success: true,
          postId: post.id,
          scheduledCount: publications.length,
        };

    } catch (error) {
        if (error.status && error.status !== 500) throw error;
        this.logger.error(`❌ SCHEDULE FAILED: ${error.message}`, error.stack);
        throw new InternalServerErrorException('Server failed to schedule post.');
    }
  }

  async editScheduledPost(postId: string, dto: { 
      publishAt?: string; 
      deleteAt?: string;
      channelIds?: string[]; 
      content?: any;
      isLiveEdit?: boolean; 
  }) {
    this.logger.log(`Editing Post ${postId} (LiveEdit: ${dto.isLiveEdit})`);

    const post = await this.postRepository.findOne({ 
        where: { id: postId },
        relations: ['publications', 'publications.channel']
    });

    if (!post) throw new NotFoundException('Post not found');

    // === LIVE EDITING LOGIC (Telegram API) ===
    if (dto.isLiveEdit) {
         if (dto.content) {
             await this.performLiveEdit(post, dto.content);
             post.contentPayload = { ...post.contentPayload, ...dto.content };
             await this.postRepository.save(post);
         }
         
         if (dto.deleteAt !== undefined) {
             const newDeleteDate = dto.deleteAt ? new Date(dto.deleteAt) : null;
             await this.updatePublicationsTimers(post.id, null, newDeleteDate); 
         }

         return { success: true, message: 'Live edit processed' };
    }

    // === STANDARD SCHEDULE EDITING ===
    const isLocked = post.publications.some(p => p.status !== PublicationStatus.SCHEDULED);
    if (isLocked) {
        throw new BadRequestException('Cannot reschedule: One or more channels have already published. Use isLiveEdit=true to update content.');
    }

    if (dto.content) {
        post.contentPayload = dto.content;
        if (dto.content.type) post.type = dto.content.type;
        await this.postRepository.save(post);
    }

    const newPublishDate = dto.publishAt ? new Date(dto.publishAt) : undefined;
    const newDeleteDate = dto.deleteAt !== undefined ? (dto.deleteAt ? new Date(dto.deleteAt) : null) : undefined;

    if (newPublishDate || newDeleteDate !== undefined) {
        await this.updatePublicationsTimers(post.id, newPublishDate, newDeleteDate);
    }

    return { success: true, postId };
  }

  async deletePost(userId: string, postId: string) {
      const post = await this.postRepository.findOne({ 
          where: { id: postId },
          relations: ['publications', 'publications.channel', 'publications.channel.bot']
      });

      if (!post) throw new NotFoundException('Post not found');

      for (const pub of post.publications) {
          if (pub.jobId) await this.removeJob(pub.jobId);
          if (pub.deleteJobId) await this.removeJob(pub.deleteJobId);

          if (pub.status === PublicationStatus.PUBLISHED && pub.tgMessageId) {
              try {
                  const { token } = await this.botsService.getBotWithDecryptedToken(pub.channel.ownerBotId);
                  const bot = new Telegraf(token);
                  
                  // Handle Topic Target for Deletion
                  let targetChatId = pub.channel.id;
                  if (pub.channel.isForum) targetChatId = pub.channel.id;
                  else if (pub.channel.linkedChatId && post.contentPayload?.options?.topic_id) targetChatId = pub.channel.linkedChatId;

                  await bot.telegram.deleteMessage(targetChatId, parseInt(pub.tgMessageId));
              } catch (e) {
                  this.logger.warn(`Failed to delete message ${pub.tgMessageId}: ${e.message}`);
              }
          }
          await this.publicationRepository.remove(pub);
      }
      await this.postRepository.remove(post);
      return { success: true };
  }

  // === HELPERS ===

  private async updatePublicationsTimers(postId: string, newPublishAt?: Date, newDeleteAt?: Date | null) {
    const pubs = await this.publicationRepository.find({ where: { postId } });

    for (const pub of pubs) {
        if (newPublishAt) {
            if (pub.jobId) await this.removeJob(pub.jobId);
            pub.publishAt = newPublishAt;
            await this.publicationRepository.save(pub);
            if (pub.status === PublicationStatus.SCHEDULED) {
                await this.scheduleJob(pub, 'publish', newPublishAt);
            }
        }

        if (newDeleteAt !== undefined) {
            if (pub.deleteJobId) {
                await this.removeJob(pub.deleteJobId);
                pub.deleteJobId = null;
            }
            pub.deleteAt = newDeleteAt;
            await this.publicationRepository.save(pub);
            if (newDeleteAt) {
                 await this.scheduleJob(pub, 'delete', newDeleteAt);
            }
        }
    }
  }

  private async scheduleJob(pub: ScheduledPublication, type: 'publish' | 'delete', date: Date) {
      const now = Date.now();
      let delay = date.getTime() - now;
      if (delay < 0) delay = 0;

      const jobName = type === 'publish' ? 'publish-post' : 'delete-post';

      try {
        const job = await this.publishingQueue.add(
            jobName, 
            { publicationId: pub.id },
            { 
                delay, 
                removeOnComplete: true,
                attempts: 3,
                backoff: { type: 'exponential', delay: 1000 }
            }
        );
        
        if (job && job.id) {
            if (type === 'publish') pub.jobId = job.id;
            else pub.deleteJobId = job.id;
            
            await this.publicationRepository.save(pub);
        }
      } catch (e) {
          this.logger.error(`Failed to schedule ${type} job for ${pub.id}: ${e.message}`);
      }
  }

  private async removeJob(jobId: string) {
      try {
          const job = await Job.fromId(this.publishingQueue, jobId);
          if (job) await job.remove();
      } catch (e) {
          // Ignore
      }
  }

  private async performLiveEdit(post: Post, newContent: any) {
      for (const pub of post.publications) {
          if (pub.status === PublicationStatus.PUBLISHED && pub.tgMessageId) {
              try {
                  const { token } = await this.botsService.getBotWithDecryptedToken(pub.channel.ownerBotId);
                  const bot = new Telegraf(token);
                  const msgId = parseInt(pub.tgMessageId);
                  const chatId = pub.channel.isForum ? pub.channel.id : (pub.channel.linkedChatId || pub.channel.id);

                  // 1. Text / Caption Edit
                  if (newContent.text) {
                      if (post.type === PostType.POST && !post.contentPayload.media) {
                          await bot.telegram.editMessageText(chatId, msgId, undefined, newContent.text, { parse_mode: 'HTML' });
                      } else {
                          await bot.telegram.editMessageCaption(chatId, msgId, undefined, newContent.text, { parse_mode: 'HTML' });
                      }
                  }

                  // 2. Buttons Edit (ReplyMarkup)
                  if (newContent.buttons !== undefined) {
                      // Pass empty object for no buttons, or structure for new buttons
                      const reply_markup = newContent.buttons ? { inline_keyboard: newContent.buttons } : undefined;
                      await bot.telegram.editMessageReplyMarkup(chatId, msgId, undefined, reply_markup);
                  }

                  // 3. Media Edit (Basic implementation for Photo/Video switch)
                  if (newContent.media && (post.type === PostType.POST)) {
                       const mediaUrl = Array.isArray(newContent.media) ? newContent.media[0] : newContent.media;
                       const type = mediaUrl.endsWith('.mp4') ? 'video' : 'photo';
                       await bot.telegram.editMessageMedia(chatId, msgId, undefined, {
                           type,
                           media: mediaUrl,
                           caption: newContent.text || post.contentPayload.text,
                           parse_mode: 'HTML'
                       });
                  }

              } catch (e) {
                  this.logger.error(`Live Edit failed for ${pub.id}: ${e.message}`);
              }
          }
      }
  }
}
