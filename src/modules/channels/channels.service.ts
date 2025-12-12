import { Injectable, BadRequestException, Logger, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Channel } from '../../database/entities/channel.entity';
import { BotsService } from '../bots/bots.service';
import { Telegraf } from 'telegraf';

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
      .orderBy('channel.createdAt', 'DESC')
      .getMany();
  }

  // === ADMIN TOOLS ===

  async createInviteLink(userId: string, botId: string, channelId: string, name?: string) {
     const { token } = await this.botsService.getBotWithDecryptedToken(botId);
     const bot = new Telegraf(token);
     
     // Security: Check if channel belongs to bot owned by user is done via getBotWithDecryptedToken check + Channel Owner ID logic
     // Ideally, we verify the channel row explicitly
     const channel = await this.channelRepository.findOne({ where: { id: channelId, ownerBotId: botId }});
     if (!channel) throw new ForbiddenException('Channel not managed by this bot');

     try {
         const invite = await bot.telegram.createChatInviteLink(channelId, {
             name: name || `Impulse Gen ${new Date().toISOString().split('T')[0]}`,
             creates_join_request: false // can be toggled
         });
         return invite;
     } catch (e) {
         throw new BadRequestException(`Telegram Error: ${e.message}`);
     }
  }

  async updateChannelProfile(userId: string, botId: string, channelId: string, updates: { title?: string, description?: string }) {
     const { token } = await this.botsService.getBotWithDecryptedToken(botId);
     const bot = new Telegraf(token);

     const channel = await this.channelRepository.findOne({ where: { id: channelId, ownerBotId: botId }});
     if (!channel) throw new ForbiddenException('Channel not managed by this bot');

     try {
        if (updates.title) {
            await bot.telegram.setChatTitle(channelId, updates.title);
            // Sync DB
            channel.title = updates.title;
        }
        if (updates.description) {
            await bot.telegram.setChatDescription(channelId, updates.description);
        }
        await this.channelRepository.save(channel);
        return { success: true, message: 'Profile updated' };
     } catch (e) {
         throw new BadRequestException(`Failed to update profile: ${e.message}. Bot needs Administrator rights.`);
     }
  }

  // === HEALTH CHECKS ===

  async verifyChannelHealth(userId: string, botId: string, channelId: string) {
    const { bot: userBot, token } = await this.botsService.getBotWithDecryptedToken(botId);
    
    if (userBot.userId !== userId) {
        throw new ForbiddenException('You do not own this bot.');
    }

    const telegraf = new Telegraf(token);

    try {
        const [chatInfo, chatMember, membersCount] = await Promise.all([
            telegraf.telegram.getChat(channelId),
            telegraf.telegram.getChatMember(channelId, parseInt(userBot.telegramBotId)),
            telegraf.telegram.getChatMembersCount(channelId)
        ]);

        if (chatMember.status !== 'administrator' && chatMember.status !== 'creator') {
            await this.deactivateChannel(channelId);
            throw new BadRequestException('Bot is no longer an Admin in this channel.');
        }

        let photoUrl = null;
        if (chatInfo.photo) {
            try {
                const link = await telegraf.telegram.getFileLink(chatInfo.photo.big_file_id);
                photoUrl = link.toString();
            } catch (e) {
                // Ignore photo error
            }
        }

        const channel = await this.channelRepository.findOne({ where: { id: channelId } });
        if (channel) {
            channel.title = (chatInfo as any).title;
            channel.membersCount = membersCount;
            if (photoUrl) channel.photoUrl = photoUrl;
            channel.isActive = true; 
            channel.ownerBotId = botId; 
            
            await this.channelRepository.save(channel);
            
            return {
                status: 'valid',
                message: 'Channel verified successfully',
                data: channel
            };
        } else {
            throw new NotFoundException('Channel not found in database.');
        }

    } catch (error) {
        this.logger.error(`Verification failed for channel ${channelId}: ${error.message}`);
        if (error.response?.error_code === 400 || error.response?.error_code === 403) {
             await this.deactivateChannel(channelId);
             throw new BadRequestException(`Verification Failed: Bot cannot access channel. (Telegram: ${error.message})`);
        }
        throw new BadRequestException(`Verification Error: ${error.message}`);
    }
  }

  async registerChannelFromWebhook(botId: string, chatObj: any) {
    const channelId = chatObj.id.toString();
    this.logger.log(`Syncing channel ${chatObj.title} (${channelId}) for bot ${botId}`);

    try {
        const { token } = await this.botsService.getBotWithDecryptedToken(botId);
        const bot = new Telegraf(token);

        const [chatInfo, membersCount] = await Promise.all([
            bot.telegram.getChat(channelId),
            bot.telegram.getChatMembersCount(channelId).catch(() => 0)
        ]);

        let photoUrl = null;
        if (chatInfo.photo) {
            try {
                const link = await bot.telegram.getFileLink(chatInfo.photo.big_file_id);
                photoUrl = link.toString();
            } catch (e) {
                this.logger.warn(`Failed to fetch photo for channel ${channelId}: ${e.message}`);
            }
        }

        const existing = await this.channelRepository.findOne({ where: { id: channelId } });
        
        if (existing) {
            existing.title = chatObj.title;
            existing.membersCount = membersCount;
            if (photoUrl) existing.photoUrl = photoUrl;
            existing.isActive = true;
            return this.channelRepository.save(existing);
        }

        const newChannel = this.channelRepository.create({
            id: channelId,
            title: chatObj.title || 'Untitled',
            photoUrl,
            membersCount,
            ownerBotId: botId,
            isActive: true,
            settings: {}
        });

        return this.channelRepository.save(newChannel);

    } catch (error) {
        this.logger.error(`Failed to register channel ${channelId}: ${error.message}`);
        const existing = await this.channelRepository.findOne({ where: { id: channelId } });
        if (!existing) {
             const basicChannel = this.channelRepository.create({
                id: channelId,
                title: chatObj.title,
                ownerBotId: botId
             });
             return this.channelRepository.save(basicChannel);
        }
        return existing;
    }
  }

  async deactivateChannel(channelId: string) {
    this.logger.warn(`Deactivating channel ${channelId} (Bot removed/kicked)`);
    await this.channelRepository.update(channelId, { isActive: false });
  }

  async syncChannels(botId: string) {
    return { 
        message: "Manual sync is deprecated. Channels appear automatically when you add the bot as Admin in Telegram." 
    };
  }

  async previewChannel(botId: string, channelUsername: string) {
     const { token } = await this.botsService.getBotWithDecryptedToken(botId);
     const bot = new Telegraf(token);
     
     const chatId = channelUsername.startsWith('@') || channelUsername.startsWith('-100') 
        ? channelUsername 
        : `@${channelUsername}`;

     try {
         const chat = await bot.telegram.getChat(chatId);
         const members = await bot.telegram.getChatMembersCount(chatId);
         return {
             id: chat.id.toString(),
             title: (chat as any).title,
             members,
             description: (chat as any).description
         };
     } catch (e) {
         throw new BadRequestException(`Could not fetch channel: ${e.message}. Ensure bot is Admin.`);
     }
  }

  async addChannel(botId: string, channelId: string, title: string) {
     return this.registerChannelFromWebhook(botId, { id: channelId, title });
  }
}