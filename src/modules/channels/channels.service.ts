
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

  /**
   * "FULL CIRCLE" VERIFICATION
   * 1. Check Connectivity
   * 2. Check Admin Rights
   * 3. Update Metadata (Photo, Title, Subs)
   * 4. Auto-Deactivate if failed
   */
  async verifyChannelHealth(userId: string, botId: string, channelId: string) {
    // 1. Validate Bot Ownership & Get Token
    // This implicitly checks if the bot belongs to the user (security check)
    const { bot: userBot, token } = await this.botsService.getBotWithDecryptedToken(botId);
    
    if (userBot.userId !== userId) {
        throw new ForbiddenException('You do not own this bot.');
    }

    const telegraf = new Telegraf(token);

    try {
        // 2. Parallel Fetch: Chat Info + Member Permissions
        // We need 'getChatMember' to verify if the bot is still an admin
        const [chatInfo, chatMember, membersCount] = await Promise.all([
            telegraf.telegram.getChat(channelId),
            telegraf.telegram.getChatMember(channelId, parseInt(userBot.telegramBotId)),
            telegraf.telegram.getChatMembersCount(channelId)
        ]);

        // 3. Strict Permission Check
        if (chatMember.status !== 'administrator' && chatMember.status !== 'creator') {
            await this.deactivateChannel(channelId);
            throw new BadRequestException('Bot is no longer an Admin in this channel.');
        }

        // Optional: Check specific posting rights (Telegram API specific)
        const canPost = (chatMember as any).can_post_messages;
        if (canPost === false) {
             throw new BadRequestException('Bot is Admin but does NOT have "Post Messages" permission.');
        }

        // 4. Resolve Photo
        let photoUrl = null;
        if (chatInfo.photo) {
            try {
                const link = await telegraf.telegram.getFileLink(chatInfo.photo.big_file_id);
                photoUrl = link.toString();
            } catch (e) {
                // Ignore photo error, not critical
            }
        }

        // 5. Force Update Database
        const channel = await this.channelRepository.findOne({ where: { id: channelId } });
        if (channel) {
            channel.title = (chatInfo as any).title;
            channel.membersCount = membersCount;
            if (photoUrl) channel.photoUrl = photoUrl;
            channel.isActive = true; // Re-enable if checks passed
            channel.ownerBotId = botId; // Ensure ownership is synced
            
            await this.channelRepository.save(channel);
            
            return {
                status: 'valid',
                message: 'Channel verified successfully',
                data: channel
            };
        } else {
            // Edge case: User clicked verify on a channel that wasn't in DB (shouldn't happen via UI usually)
            throw new NotFoundException('Channel not found in database. Add the bot to the channel first.');
        }

    } catch (error) {
        this.logger.error(`Verification failed for channel ${channelId}: ${error.message}`);
        
        // If Telegram says "Chat not found" or "Forbidden", we deactivate
        if (error.response?.error_code === 400 || error.response?.error_code === 403) {
             await this.deactivateChannel(channelId);
             throw new BadRequestException(`Verification Failed: Bot cannot access channel. (Telegram: ${error.message})`);
        }

        throw new BadRequestException(`Verification Error: ${error.message}`);
    }
  }

  // Called automatically by Webhook when bot becomes Admin
  async registerChannelFromWebhook(botId: string, chatObj: any) {
    const channelId = chatObj.id.toString();
    this.logger.log(`Syncing channel ${chatObj.title} (${channelId}) for bot ${botId}`);

    try {
        // 1. Get Bot Token to communicate with Telegram
        const { token } = await this.botsService.getBotWithDecryptedToken(botId);
        const bot = new Telegraf(token);

        // 2. Fetch Extended Chat Info (Photo) & Member Count
        // We use Promise.all for concurrency
        const [chatInfo, membersCount] = await Promise.all([
            bot.telegram.getChat(channelId),
            bot.telegram.getChatMembersCount(channelId).catch(() => 0)
        ]);

        let photoUrl = null;

        // 3. Resolve Photo URL
        // 'photo' exists on Chat object if it's not private and has an avatar
        if (chatInfo.photo) {
            try {
                // getFileLink returns a URL object or string
                const link = await bot.telegram.getFileLink(chatInfo.photo.big_file_id);
                photoUrl = link.toString();
            } catch (e) {
                this.logger.warn(`Failed to fetch photo for channel ${channelId}: ${e.message}`);
            }
        }

        // 4. Upsert to DB
        const existing = await this.channelRepository.findOne({ where: { id: channelId } });
        
        if (existing) {
            existing.title = chatObj.title;
            existing.membersCount = membersCount;
            if (photoUrl) existing.photoUrl = photoUrl;
            existing.isActive = true; // Reactivate if it was disabled
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
        // Fallback: Save basic info if Telegram API fails completely
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

  // DEPRECATED: Manual sync is no longer primary method
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
     // Trigger the full sync logic
     return this.registerChannelFromWebhook(botId, { id: channelId, title });
  }
}
