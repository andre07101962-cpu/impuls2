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

  async schedulePost(content: any, channelIds: string[], publishAtIso: string) {
    this.logger.log(`Incoming Schedule Request for ${channelIds.length} channels at ${publishAtIso}`);

    try {
        const publishDate = new Date(publishAtIso);

        if (isNaN(publishDate.getTime())) {
            throw new BadRequestException('Invalid date format provided for publishAt');
        }

        // Determine Type from content or default to POST
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

        const inactiveChannels = channels.filter(c => !c.isActive);
        if (inactiveChannels.length > 0) {
            throw new BadRequestException(`Cannot schedule to inactive channels: ${inactiveChannels.map(c => c.title).join(', ')}.`);
        }

        if (channels.length !== cleanChannelIds.length) {
            const foundIds = channels.map(c => c.id);
            const missing = cleanChannelIds.filter(id => !foundIds.includes(id));
            throw new BadRequestException(`Channels not found: ${missing.join(', ')}`);
        }

        const publications = [];
        const now = Date.now();
        let delay = publishDate.getTime() - now;
        if (delay < 0) delay = 0;

        for (const channel of channels) {
          const pub = this.publicationRepository.create({
            post,
            channel,
            publishAt: publishDate,
            status: PublicationStatus.SCHEDULED,
          });
          await this.publicationRepository.save(pub);
          
          try {
              const job = await this.publishingQueue.add(
                'send-post', 
                { publicationId: pub.id },
                { 
                    delay: delay, 
                    removeOnComplete: true,
                    attempts: 3,
                    backoff: { type: 'exponential', delay: 1000 }
                }
              );

              if (job && job.id) {
                  pub.jobId = job.id;
                  await this.publicationRepository.save(pub);
              }
              
              publications.push(pub);

          } catch (queueError) {
              this.logger.error(`CRITICAL: Redis/BullMQ failed. Error: ${queueError.message}`);
              throw new InternalServerErrorException(`Scheduling Queue is offline`);
          }
        }

        return {
          success: true,
          postId: post.id,
          scheduledCount: publications.length,
          publishAt: publishDate,
        };

    } catch (error) {
        if (error.status && error.status !== 500) throw error;
        this.logger.error(`❌ SCHEDULE FAILED: ${error.message}`, error.stack);
        throw new InternalServerErrorException('Server failed to schedule post.');
    }
  }

  async editScheduledPost(postId: string, dto: { publishAt?: string; channelIds?: string[]; content?: any }) {
    this.logger.log(`Editing Post ${postId}`);

    const post = await this.postRepository.findOne({ 
        where: { id: postId },
        relations: ['publications', 'publications.channel']
    });

    if (!post) throw new NotFoundException('Post not found');

    const isLocked = post.publications.some(p => p.status !== PublicationStatus.SCHEDULED);
    if (isLocked) {
        throw new BadRequestException('Cannot edit this post: One or more channels have already published or failed. Delete and recreate if necessary.');
    }

    if (dto.content) {
        post.contentPayload = dto.content;
        // If content changes type, update it
        if (dto.content.type) {
             post.type = dto.content.type;
        }
        await this.postRepository.save(post);
    }

    const newPublishDate = dto.publishAt ? new Date(dto.publishAt) : null;
    if (newPublishDate && isNaN(newPublishDate.getTime())) {
        throw new BadRequestException('Invalid publishAt date');
    }

    if (dto.channelIds) {
        const cleanIds = dto.channelIds.map(String);
        const existingChannelIds = post.publications.map(p => p.channelId);

        const toRemove = post.publications.filter(p => !cleanIds.includes(p.channelId));
        
        for (const pub of toRemove) {
            await this.removeJobAndPublication(pub);
        }

        const toAddIds = cleanIds.filter(id => !existingChannelIds.includes(id));
        if (toAddIds.length > 0) {
            const newChannels = await this.channelRepository.findBy({ id: In(toAddIds) });
            const targetDate = newPublishDate || post.publications[0]?.publishAt || new Date();
            
            for (const channel of newChannels) {
                if (!channel.isActive) continue; 

                const pub = this.publicationRepository.create({
                    post,
                    channel,
                    publishAt: targetDate,
                    status: PublicationStatus.SCHEDULED,
                });
                await this.publicationRepository.save(pub);
                await this.scheduleJobForPublication(pub, targetDate);
            }
        }
    }

    if (newPublishDate) {
        const remainingPubs = await this.publicationRepository.find({ where: { postId: post.id } });
        
        for (const pub of remainingPubs) {
            if (pub.jobId) {
                try {
                    const job = await Job.fromId(this.publishingQueue, pub.jobId);
                    if (job) await job.remove();
                } catch (e) {
                    this.logger.warn(`Could not remove old job ${pub.jobId}: ${e.message}`);
                }
            }
            
            pub.publishAt = newPublishDate;
            await this.publicationRepository.save(pub);
            await this.scheduleJobForPublication(pub, newPublishDate);
        }
    }

    return { success: true, postId };
  }

  async deletePost(userId: string, postId: string) {
      this.logger.log(`User ${userId} requested delete for post ${postId}`);
      
      const post = await this.postRepository.findOne({ 
          where: { id: postId },
          relations: ['publications', 'publications.channel', 'publications.channel.bot']
      });

      if (!post) throw new NotFoundException('Post not found');

      // Security Check: Ensure user owns the bot that owns the channels
      // We check the first publication for efficiency
      if (post.publications.length > 0) {
          const ownerId = post.publications[0].channel.bot.userId;
          if (ownerId !== userId) throw new ForbiddenException('You do not own this post');
      }

      const results = {
          cancelled: 0,
          deletedFromTelegram: 0,
          errors: 0
      };

      for (const pub of post.publications) {
          // 1. If Scheduled: Cancel Job
          if (pub.status === PublicationStatus.SCHEDULED) {
              if (pub.jobId) {
                  try {
                      const job = await Job.fromId(this.publishingQueue, pub.jobId);
                      if (job) await job.remove();
                      results.cancelled++;
                  } catch (e) {
                      this.logger.warn(`Failed to cancel job ${pub.jobId}: ${e.message}`);
                  }
              }
          }
          // 2. If Published: Delete from Telegram
          else if (pub.status === PublicationStatus.PUBLISHED && pub.tgMessageId) {
              try {
                  const { token } = await this.botsService.getBotWithDecryptedToken(pub.channel.ownerBotId);
                  const bot = new Telegraf(token);
                  await bot.telegram.deleteMessage(pub.channel.id, parseInt(pub.tgMessageId));
                  results.deletedFromTelegram++;
              } catch (e) {
                  this.logger.warn(`Failed to delete message ${pub.tgMessageId} in channel ${pub.channel.id}: ${e.message}`);
                  results.errors++;
              }
          }
          
          await this.publicationRepository.remove(pub);
      }

      await this.postRepository.remove(post);

      return {
          success: true,
          details: results
      };
  }

  private async removeJobAndPublication(pub: ScheduledPublication) {
      if (pub.jobId) {
          try {
              const job = await Job.fromId(this.publishingQueue, pub.jobId);
              if (job) await job.remove();
          } catch (e) {
              this.logger.warn(`Failed to remove job ${pub.jobId} during edit: ${e.message}`);
          }
      }
      await this.publicationRepository.remove(pub);
  }

  private async scheduleJobForPublication(pub: ScheduledPublication, date: Date) {
      const now = Date.now();
      let delay = date.getTime() - now;
      if (delay < 0) delay = 0;

      try {
        const job = await this.publishingQueue.add(
            'send-post', 
            { publicationId: pub.id },
            { 
                delay, 
                removeOnComplete: true,
                attempts: 3,
                backoff: { type: 'exponential', delay: 1000 }
            }
        );
        if (job && job.id) {
            pub.jobId = job.id;
            await this.publicationRepository.save(pub);
        }
      } catch (e) {
          this.logger.error(`Failed to reschedule job for ${pub.id}: ${e.message}`);
      }
  }
}