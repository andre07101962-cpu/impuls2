
import { Injectable, BadRequestException, InternalServerErrorException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Post } from '../../database/entities/post.entity';
import { ScheduledPublication, PublicationStatus } from '../../database/entities/scheduled-publication.entity';
import { Channel } from '../../database/entities/channel.entity';

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
  ) {}

  async schedulePost(content: any, channelIds: string[], publishAtIso: string) {
    this.logger.log(`Incoming Schedule Request for ${channelIds.length} channels at ${publishAtIso}`);

    try {
        const publishDate = new Date(publishAtIso);

        // 1. Strict Date Validation (Fixes NaN Error 500)
        if (isNaN(publishDate.getTime())) {
            throw new BadRequestException('Invalid date format provided for publishAt');
        }

        // 2. Create Post (Template)
        const post = this.postRepository.create({
          contentPayload: content,
          name: `Post ${new Date().toISOString()}`,
        });
        await this.postRepository.save(post);

        // 3. Validate Channels
        // Fix: Explicitly confirm these are strings for BigInt columns to avoid driver confusion
        const cleanChannelIds = channelIds.map(id => String(id));
        
        const channels = await this.channelRepository.findBy({
            id: In(cleanChannelIds) 
        });

        if (channels.length !== cleanChannelIds.length) {
            const foundIds = channels.map(c => c.id);
            const missing = cleanChannelIds.filter(id => !foundIds.includes(id));
            this.logger.warn(`Channels not found: ${missing.join(', ')}`);
            throw new BadRequestException(`Channels not found: ${missing.join(', ')}`);
        }

        // 4. Create Publications & Schedule Jobs
        const publications = [];
        const now = Date.now();

        // Fix: Robust Delay Calculation (Prevents Negative Delay Crash)
        let delay = publishDate.getTime() - now;
        
        // If date is in the past, send immediately (delay = 0)
        if (delay < 0) {
            delay = 0;
            this.logger.warn(`⚠️ Publish time is in the past (${publishAtIso}). Scheduling for immediate execution.`);
        }

        for (const channel of channels) {
          const pub = this.publicationRepository.create({
            post,
            channel,
            publishAt: publishDate,
            status: PublicationStatus.SCHEDULED,
          });
          await this.publicationRepository.save(pub);
          publications.push(pub);

          // Add to Bull Queue
          try {
              await this.publishingQueue.add(
                'send-post', 
                { publicationId: pub.id },
                { 
                    delay: delay, 
                    removeOnComplete: true,
                    attempts: 3, // Retry 3 times on failure
                    backoff: { type: 'exponential', delay: 1000 }
                }
              );
          } catch (queueError) {
              this.logger.error(`CRITICAL: Redis/BullMQ failed. Is REDIS_URL set? Error: ${queueError.message}`);
              // We rollback (or at least fail hard here so we know)
              throw new InternalServerErrorException(`Scheduling Queue is offline: ${queueError.message}`);
          }
        }

        this.logger.log(`✅ Successfully scheduled ${publications.length} posts. Delay: ${delay}ms`);

        return {
          success: true,
          postId: post.id,
          scheduledCount: publications.length,
          publishAt: publishDate,
        };

    } catch (error) {
        // If it's already an HTTP exception (e.g. BadRequest), rethrow it
        if (error.status && error.status !== 500) {
            throw error;
        }
        
        // Log the REAL error for the backend developer
        this.logger.error(`❌ SCHEDULE FAILED: ${error.message}`, error.stack);
        
        // Return a generic error to frontend, but now we have logs
        throw new InternalServerErrorException('Server failed to schedule post. Check backend logs.');
    }
  }
}
