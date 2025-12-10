import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Channel } from '../../database/entities/channel.entity';
import { BotsService } from '../bots/bots.service';
import { Telegraf } from 'telegraf';
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
    this.logger.log('🔄 Starting Channel Full Sync (Stats + Metadata)...');

    // 1. Fetch Active Channels
    const channels = await this.channelRepository.find({
      where: { isActive: true },
    });

    if (channels.length === 0) {
        this.logger.log('No active channels to sync.');
        return;
    }

    let updatedCount = 0;
    let errorCount = 0;

    // 2. Iterate sequentially
    for (const channel of channels) {
      try {
        // Decrypt Token
        const { token } = await this.botsService.getBotWithDecryptedToken(channel.ownerBotId);
        const bot = new Telegraf(token);

        // Fetch Full Info (Chat + Members)
        const [chatInfo, membersCount] = await Promise.all([
             bot.telegram.getChat(channel.id),
             bot.telegram.getChatMembersCount(channel.id)
        ]);

        // Resolve Photo
        let photoUrl = channel.photoUrl; // Keep old one by default
        if (chatInfo.photo) {
             try {
                const link = await bot.telegram.getFileLink(chatInfo.photo.big_file_id);
                photoUrl = link.toString();
             } catch (e) {
                // Ignore photo fetch errors
             }
        }

        // Check if anything changed
        const titleChanged = (chatInfo as any).title !== channel.title;
        const membersChanged = membersCount !== channel.membersCount;
        const photoChanged = photoUrl !== channel.photoUrl;

        if (titleChanged || membersChanged || photoChanged) {
            await this.channelRepository.update(channel.id, { 
                membersCount,
                title: (chatInfo as any).title,
                photoUrl
            });
            updatedCount++;
        }

      } catch (error) {
        errorCount++;
        // If bot is kicked (403) or chat not found (400), deactivate channel
        // Telegraf errors have 'response' or 'code'
        const errCode = (error as any).response?.error_code || (error as any).code;
        
        if (errCode === 403 || errCode === 400 || (error.message && error.message.includes('chat not found'))) {
            this.logger.warn(`Bot kicked/removed from channel ${channel.id}. Deactivating...`);
            await this.channelRepository.update(channel.id, { isActive: false });
        }
      }

      // 3. Polite Delay (200ms)
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    this.logger.log(`✅ Sync Complete. Updated: ${updatedCount}, Errors/Deactivations: ${errorCount}`);
  }
}