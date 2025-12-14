import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Channel } from '../../database/entities/channel.entity';

@Injectable()
export class ChannelSyncService {
  private readonly logger = new Logger(ChannelSyncService.name);

  constructor(
    @InjectRepository(Channel)
    private channelRepository: Repository<Channel>,
    @InjectQueue('channel-sync') private syncQueue: Queue, // <--- Producer
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async dispatchSyncJobs() {
    this.logger.log('🔄 Cron: Dispatching Sync Jobs...');

    // 🚀 SCALABILITY: Fetch ONLY IDs. Do not load full entities into memory.
    const channels = await this.channelRepository.find({
      where: { isActive: true },
      select: ['id', 'ownerBotId'], // Ultra-light query
    });

    if (channels.length === 0) {
        this.logger.log('No active channels to sync.');
        return;
    }

    this.logger.log(`Creating jobs for ${channels.length} channels...`);

    // Bulk add to Redis is faster
    const jobs = channels.map(channel => ({
        name: 'sync-metadata',
        data: { channelId: channel.id, botId: channel.ownerBotId },
        opts: {
            removeOnComplete: true, // Don't fill Redis with success logs
            removeOnFail: 500, // Keep last 500 errors for debugging
            attempts: 3,
            backoff: { type: 'exponential', delay: 2000 }
        }
    }));

    await this.syncQueue.addBulk(jobs);

    this.logger.log(`✅ Dispatched ${channels.length} jobs to 'channel-sync' queue.`);
  }
}