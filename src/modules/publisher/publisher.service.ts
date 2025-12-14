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
          
          // 1. Schedule Publication
          await this.scheduleJob(pub, 'publish', publishDate);
          
          // 2. Schedule Auto-Deletion (if requested)
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
    this.logger.log(`Editing Post ${postId}`);

    const post = await this.postRepository.findOne({ 
        where: { id: postId },
        relations: ['publications', 'publications.channel']
    });

    if (!post) throw new NotFoundException('Post not found');

    // === LIVE EDITING LOGIC (Telegram API) ===
    if (dto.isLiveEdit && dto.content) {
         // This is a complex operation: We try to edit text in Telegram for already published posts
         await this.performLiveEdit(post, dto.content);
         // Update DB content so history is correct
         post.contentPayload = dto.content;
         await this.postRepository.save(post);
         return { success: true, message: 'Live edit attempted' };
    }

    // === STANDARD SCHEDULE EDITING ===
    const isLocked = post.publications.some(p => p.status !== PublicationStatus.SCHEDULED);
    if (isLocked) {
        throw new BadRequestException('Cannot reschedule: One or more channels have already published. Use isLiveEdit=true to update content.');
    }

    // 1. Update Content
    if (dto.content) {
        post.contentPayload = dto.content;
        if (dto.content.type) post.type = dto.content.type;
        await this.postRepository.save(post);
    }

    // 2. Handle Channels (Add/Remove)
    // ... (Simplified for this response: assuming channels don't change often in edit, focusing on time)

    // 3. Update Time (Publish & Delete)
    const newPublishDate = dto.publishAt ? new Date(dto.publishAt) : null;
    const newDeleteDate = dto.deleteAt ? new Date(dto.deleteAt) : (dto.deleteAt === null ? null : undefined); // explicitly null removes it

    const remainingPubs = await this.publicationRepository.find({ where: { postId: post.id } });
        
    for (const pub of remainingPubs) {
        // Handle Publish Time Change
        if (newPublishDate) {
            if (pub.jobId) await this.removeJob(pub.jobId);
            pub.publishAt = newPublishDate;
            await this.publicationRepository.save(pub);
            await this.scheduleJob(pub, 'publish', newPublishDate);
        }

        // Handle Delete Time Change
        if (newDeleteDate !== undefined) {
            // Remove old delete job if exists
            if (pub.deleteJobId) {
                await this.removeJob(pub.deleteJobId);
                pub.deleteJobId = null;
            }
            
            pub.deleteAt = newDeleteDate;
            await this.publicationRepository.save(pub);

            if (newDeleteDate) {
                await this.scheduleJob(pub, 'delete', newDeleteDate);
            }
        }
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
          // Cancel Publish Job
          if (pub.jobId) await this.removeJob(pub.jobId);
          // Cancel Delete Job
          if (pub.deleteJobId) await this.removeJob(pub.deleteJobId);

          // If published, try to delete from Telegram immediately
          if (pub.status === PublicationStatus.PUBLISHED && pub.tgMessageId) {
              try {
                  const { token } = await this.botsService.getBotWithDecryptedToken(pub.channel.ownerBotId);
                  const bot = new Telegraf(token);
                  await bot.telegram.deleteMessage(pub.channel.id, parseInt(pub.tgMessageId));
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

  private async scheduleJob(pub: ScheduledPublication, type: 'publish' | 'delete', date: Date) {
      const now = Date.now();
      let delay = date.getTime() - now;
      if (delay < 0) delay = 0;

      // BullMQ allows custom job names. 
      // 'publish-post' triggers the publishing logic
      // 'delete-post' triggers the deletion logic
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
                  
                  // Telegram allows editing Text or Caption.
                  // It DOES NOT allow switching media types easily via standard API without deleting/resending.
                  if (newContent.text) {
                      // Attempt to edit text
                      if (post.type === PostType.POST && !post.contentPayload.media) {
                          // Text Message
                          await bot.telegram.editMessageText(
                              pub.channel.id, 
                              parseInt(pub.tgMessageId), 
                              undefined, 
                              newContent.text, 
                              { parse_mode: 'HTML' }
                          );
                      } else if (post.contentPayload.media) {
                          // Caption
                          await bot.telegram.editMessageCaption(
                              pub.channel.id, 
                              parseInt(pub.tgMessageId), 
                              undefined, 
                              newContent.text, 
                              { parse_mode: 'HTML' }
                          );
                      }
                  }
                  // TODO: Implement editMessageMedia for changing images
              } catch (e) {
                  this.logger.error(`Live Edit failed for ${pub.id}: ${e.message}`);
              }
          }
      }
  }
}