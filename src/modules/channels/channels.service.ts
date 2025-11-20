
import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Channel } from '../../database/entities/channel.entity';
import { BotsService } from '../bots/bots.service';
import axios from 'axios';

@Injectable()
export class ChannelsService {
  private readonly logger = new Logger(ChannelsService.name);

  constructor(
    @InjectRepository(Channel)
    private channelRepository: Repository<Channel>,
    private botsService: BotsService,
  ) {}

  async getUserChannels(userId: string) {
    return this.channelRepository.createQueryBuilder('channel')
      .leftJoinAndSelect('channel.bot', 'bot')
      .where('bot.userId = :userId', { userId })
      .getMany();
  }

  // Called automatically by Webhook when bot becomes Admin
  async registerChannelFromWebhook(botId: string, chatObj: any) {
    const channelId = chatObj.id.toString();
    
    // Check if exists
    const existing = await this.channelRepository.findOne({ where: { id: channelId } });
    if (existing) {
        // Update title if changed
        if (existing.title !== chatObj.title) {
            existing.title = chatObj.title;
            await this.channelRepository.save(existing);
        }
        return existing;
    }

    // Create new
    const channel = this.channelRepository.create({
        id: channelId,
        title: chatObj.title || 'Untitled Channel',
        ownerBotId: botId,
        settings: {}, 
    });

    this.logger.log(`Auto-synced channel: ${chatObj.title}`);
    return this.channelRepository.save(channel);
  }

  // DEPRECATED: Manual sync is no longer primary method
  async syncChannels(botId: string) {
    return { 
        message: "Manual sync is deprecated. Channels appear automatically when you add the bot as Admin in Telegram." 
    };
  }

  async previewChannel(botId: string, channelUsername: string) {
    // Preview logic remains for manual checks if needed
    const { bot, token } = await this.botsService.getBotWithDecryptedToken(botId);
    const chatId = channelUsername.startsWith('@') || channelUsername.startsWith('-100') ? channelUsername : `@${channelUsername}`;
    
    // Basic validation...
    return { message: "Preview logic" };
  }

  async addChannel(botId: string, channelId: string, title: string) {
     return this.registerChannelFromWebhook(botId, { id: channelId, title });
  }
}
