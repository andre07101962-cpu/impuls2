import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Channel } from '../../database/entities/channel.entity';
import { BotsService } from '../bots/bots.service';
import axios from 'axios';

@Injectable()
export class ChannelSyncService {
  private readonly logger = new Logger(ChannelSyncService.name);

  constructor(
    @InjectRepository(Channel)
    private channelRepository: Repository<Channel>,
    private botsService: BotsService,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async syncSubscribers() {
    this.logger.log('🔄 Starting Channel Statistics Sync...');

    // 1. Fetch Active Channels
    // In production, you might want to paginate this if you have thousands of channels
    const channels = await this.channelRepository.find({
      where: { isActive: true },
    });

    if (channels.length === 0) {
        this.logger.log('No active channels to sync.');
        return;
    }

    let updatedCount = 0;
    let errorCount = 0;

    // 2. Iterate sequentially to avoid flooding CPU/Network
    for (const channel of channels) {
      try {
        // Decrypt Token
        const { token } = await this.botsService.getBotWithDecryptedToken(channel.ownerBotId);

        // Fetch Member Count
        const response = await axios.get(`https://api.telegram.org/bot${token}/getChatMemberCount?chat_id=${channel.id}`);
        const count = response.data.result;

        // Update DB
        if (channel.membersCount !== count) {
            await this.channelRepository.update(channel.id, { membersCount: count });
        }
        updatedCount++;

      } catch (error) {
        errorCount++;
        // If bot is kicked (403) or chat not found (400), we could deactivate channel here too
        if (axios.isAxiosError(error) && (error.response?.status === 403 || error.response?.status === 400)) {
            await this.channelRepository.update(channel.id, { isActive: false });
        }
      }

      // 3. Polite Delay (200ms)
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    this.logger.log(`✅ Sync Complete. Updated: ${updatedCount}, Errors: ${errorCount}`);
  }
}