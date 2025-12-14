import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Channel } from '../../database/entities/channel.entity';
import { BotsService } from '../bots/bots.service';
import { Telegraf } from 'telegraf';

@Processor('channel-sync')
export class ChannelSyncProcessor extends WorkerHost {
  private readonly logger = new Logger(ChannelSyncProcessor.name);

  constructor(
    @InjectRepository(Channel)
    private channelRepository: Repository<Channel>,
    private botsService: BotsService,
  ) {
    super();
  }

  async process(job: Job<{ channelId: string; botId: string }>) {
    const { channelId, botId } = job.data;
    
    // 🛡️ RESILIENCE: Check if channel still needs sync (optional double-check)
    const channel = await this.channelRepository.findOne({ 
        where: { id: channelId },
        select: ['id', 'title', 'membersCount', 'photoUrl', 'isActive']
    });

    if (!channel || !channel.isActive) return;

    try {
        const { token } = await this.botsService.getBotWithDecryptedToken(botId);
        const bot = new Telegraf(token);

        // Fetch Stats
        const [chatInfo, membersCount] = await Promise.all([
             bot.telegram.getChat(channelId),
             bot.telegram.getChatMembersCount(channelId)
        ]);

        // Resolve Photo
        let photoUrl = channel.photoUrl; 
        if (chatInfo.photo) {
             try {
                const link = await bot.telegram.getFileLink(chatInfo.photo.big_file_id);
                photoUrl = link.toString();
             } catch (e) {
                // Photo failures are minor, ignore
             }
        }

        // Update DB only if changed
        if (
            (chatInfo as any).title !== channel.title || 
            membersCount !== channel.membersCount || 
            photoUrl !== channel.photoUrl
        ) {
            await this.channelRepository.update(channel.id, { 
                membersCount,
                title: (chatInfo as any).title,
                photoUrl
            });
            // this.logger.debug(`Updated ${channel.id}`);
        }

    } catch (error: any) {
        // 🛡️ FLOOD WAIT PROTECTION
        // Telegram returns "Retry After X" in parameters
        const retryAfter = error?.parameters?.retry_after;
        
        if (retryAfter) {
            this.logger.warn(`🛑 FloodWait for ${channelId}: Pausing job for ${retryAfter}s`);
            // Smart Pause: Move job to delayed bucket so it retries later without crashing
            await job.moveToDelayed(Date.now() + (retryAfter * 1000) + 1000, job.token);
            return; 
        }

        const errCode = error?.response?.error_code || error?.code;
        
        // Bot Kicked / Chat Not Found
        if (errCode === 403 || errCode === 400 || (error.message && error.message.includes('chat not found'))) {
            this.logger.warn(`Bot removed from ${channelId}. Deactivating.`);
            await this.channelRepository.update(channelId, { isActive: false });
            return; // Don't retry
        }

        // Unknown error -> Throw to let BullMQ handle retry (exponential backoff)
        throw error;
    }
  }
}