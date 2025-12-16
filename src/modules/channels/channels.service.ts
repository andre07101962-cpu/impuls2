import { Injectable, BadRequestException, Logger, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Channel, ChannelType } from '../../database/entities/channel.entity';
import { ForumTopic } from '../../database/entities/forum-topic.entity';
import { BotsService } from '../bots/bots.service';
import { Telegraf } from 'telegraf';

@Injectable()
export class ChannelsService {
  private readonly logger = new Logger(ChannelsService.name);

  constructor(
    @InjectRepository(Channel)
    private channelRepository: Repository<Channel>,
    @InjectRepository(ForumTopic)
    private topicRepository: Repository<ForumTopic>,
    private botsService: BotsService,
  ) {}

  async getUserChannels(userId: string) {
    return this.channelRepository.createQueryBuilder('channel')
      .leftJoinAndSelect('channel.bot', 'bot')
      .where('bot.userId = :userId', { userId })
      .orderBy('channel.createdAt', 'DESC')
      .getMany();
  }

  // === TOPIC MANAGEMENT (FORUMS) ===

  async getChannelTopics(userId: string, channelId: string) {
    await this.verifyChannelAccess(userId, channelId);
    return this.topicRepository.find({
        where: { channelId },
        order: { isClosed: 'ASC', createdAt: 'DESC' }
    });
  }

  async createTopic(userId: string, botId: string, channelId: string, name: string, iconColor?: number, iconEmojiId?: string) {
    const channel = await this.verifyChannelAccess(userId, channelId, botId);

    if (!channel.linkedChatId && !channel.isForum) {
        throw new BadRequestException('This channel is not a forum and does not have a linked discussion group.');
    }

    const targetChatId = channel.isForum ? channel.id : channel.linkedChatId;

    const { token } = await this.botsService.getBotWithDecryptedToken(botId, userId);
    const bot = new Telegraf(token);

    try {
        const topic = await bot.telegram.createForumTopic(targetChatId, name, {
            icon_color: iconColor as any,
            icon_custom_emoji_id: iconEmojiId
        });

        const newTopic = this.topicRepository.create({
            telegramTopicId: topic.message_thread_id,
            name: topic.name,
            iconColor: topic.icon_color,
            iconCustomEmojiId: topic.icon_custom_emoji_id,
            channelId: channelId,
            isClosed: false
        });

        return this.topicRepository.save(newTopic);
    } catch (e) {
        throw new BadRequestException(`Failed to create topic: ${e.message}. Ensure bot is Admin and 'Topics' are enabled.`);
    }
  }

  async editTopic(userId: string, botId: string, channelId: string, topicId: string, updates: { name?: string, iconEmojiId?: string }) {
    const channel = await this.verifyChannelAccess(userId, channelId, botId);
    const storedTopic = await this.topicRepository.findOne({ where: { id: topicId, channelId } });
    if (!storedTopic) throw new NotFoundException('Topic not found in DB');

    const targetChatId = channel.isForum ? channel.id : channel.linkedChatId;
    if (!targetChatId) throw new BadRequestException('No chat found to perform topic action');

    const { token } = await this.botsService.getBotWithDecryptedToken(botId, userId);
    const bot = new Telegraf(token);

    try {
        await bot.telegram.editForumTopic(targetChatId, storedTopic.telegramTopicId, {
            name: updates.name,
            icon_custom_emoji_id: updates.iconEmojiId
        });

        if (updates.name) storedTopic.name = updates.name;
        if (updates.iconEmojiId) storedTopic.iconCustomEmojiId = updates.iconEmojiId;
        
        return this.topicRepository.save(storedTopic);
    } catch (e) {
        throw new BadRequestException(`Failed to edit topic: ${e.message}`);
    }
  }

  async closeTopic(userId: string, botId: string, channelId: string, topicId: string) {
      return this.toggleTopicState(userId, botId, channelId, topicId, 'closeForumTopic', true);
  }

  async reopenTopic(userId: string, botId: string, channelId: string, topicId: string) {
      return this.toggleTopicState(userId, botId, channelId, topicId, 'reopenForumTopic', false);
  }

  async deleteTopic(userId: string, botId: string, channelId: string, topicId: string) {
      const channel = await this.verifyChannelAccess(userId, channelId, botId);
      const storedTopic = await this.topicRepository.findOne({ where: { id: topicId, channelId } });
      if (!storedTopic) throw new NotFoundException('Topic not found');

      const targetChatId = channel.isForum ? channel.id : channel.linkedChatId;
      if (!targetChatId) throw new BadRequestException('No chat found');

      const { token } = await this.botsService.getBotWithDecryptedToken(botId, userId);
      const bot = new Telegraf(token);

      try {
          await bot.telegram.deleteForumTopic(targetChatId, storedTopic.telegramTopicId);
          await this.topicRepository.remove(storedTopic);
          return { success: true };
      } catch (e) {
          throw new BadRequestException(`Failed to delete topic: ${e.message}`);
      }
  }

  // === WEBHOOK SYNC HANDLERS (INBOUND) ===

  async syncTopicFromWebhook(botId: string, chatId: string, data: { id: number, name?: string, iconColor?: number, iconCustomEmojiId?: string }) {
      // Logic: chatId comes from Telegram. 
      // It could be the Channel ID (if it's a Forum Supergroup) OR the Linked Group ID (if it's a Channel+Group setup).
      
      let channel = await this.channelRepository.findOne({ where: { linkedChatId: chatId } });
      
      // Fallback: Check if the chatId itself is the channel (Forum mode)
      if (!channel) {
          channel = await this.channelRepository.findOne({ where: { id: chatId } });
      }

      if (!channel) {
          this.logger.warn(`Received topic event for unknown chat/link ${chatId}. Ignoring.`);
          return;
      }

      let topic = await this.topicRepository.findOne({ 
          where: { channelId: channel.id, telegramTopicId: data.id } 
      });

      if (!topic) {
          topic = this.topicRepository.create({
              channelId: channel.id,
              telegramTopicId: data.id,
              name: data.name || 'Untitled Topic',
              isClosed: false
          });
      }

      if (data.name) topic.name = data.name;
      if (data.iconColor) topic.iconColor = data.iconColor;
      if (data.iconCustomEmojiId) topic.iconCustomEmojiId = data.iconCustomEmojiId;

      await this.topicRepository.save(topic);
  }

  async updateTopicStatus(chatId: string, topicId: number, isClosed: boolean) {
      let channel = await this.channelRepository.findOne({ where: { linkedChatId: chatId } });
      if (!channel) channel = await this.channelRepository.findOne({ where: { id: chatId } });
      
      if (!channel) return;

      const topic = await this.topicRepository.findOne({ 
          where: { channelId: channel.id, telegramTopicId: topicId } 
      });

      if (topic) {
          topic.isClosed = isClosed;
          await this.topicRepository.save(topic);
      }
  }

  // === ADMIN TOOLS ===

  async createInviteLink(userId: string, botId: string, channelId: string, name?: string) {
     const { token } = await this.botsService.getBotWithDecryptedToken(botId, userId);
     const bot = new Telegraf(token);
     await this.verifyChannelAccess(userId, channelId, botId);

     try {
         const invite = await bot.telegram.createChatInviteLink(channelId, {
             name: name || `Impulse Gen ${new Date().toISOString().split('T')[0]}`,
             creates_join_request: false
         });
         return invite;
     } catch (e) {
         throw new BadRequestException(`Telegram Error: ${e.message}`);
     }
  }

  async updateChannelProfile(userId: string, botId: string, channelId: string, updates: { title?: string, description?: string }) {
     const { token } = await this.botsService.getBotWithDecryptedToken(botId, userId);
     const bot = new Telegraf(token);
     const channel = await this.verifyChannelAccess(userId, channelId, botId);

     try {
        if (updates.title) {
            await bot.telegram.setChatTitle(channelId, updates.title);
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

  // === HEALTH CHECKS & SYNC ===

  async verifyChannelHealth(userId: string, botId: string, channelId: string) {
    const { bot: userBot, token } = await this.botsService.getBotWithDecryptedToken(botId, userId);
    
    if (userBot.userId !== userId) throw new ForbiddenException('You do not own this bot.');
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
            } catch (e) {}
        }

        const channel = await this.channelRepository.findOne({ where: { id: channelId } });
        if (channel) {
            channel.title = (chatInfo as any).title;
            channel.username = (chatInfo as any).username;
            channel.type = (chatInfo as any).type;
            channel.isForum = !!(chatInfo as any).is_forum;
            channel.membersCount = membersCount;
            if (photoUrl) channel.photoUrl = photoUrl;
            
            if ((chatInfo as any).linked_chat_id) {
                channel.linkedChatId = (chatInfo as any).linked_chat_id.toString();
            }

            channel.isActive = true; 
            channel.ownerBotId = botId; 
            await this.channelRepository.save(channel);
            
            return { status: 'valid', message: 'Channel verified', data: channel };
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
    
    // 🔍 DEEP LOGGING: Analyze what we are dealing with
    this.logger.debug(`📥 REGISTERING CHANNEL [${channelId}]: ${JSON.stringify(chatObj, null, 2)}`);

    let title = chatObj.title || 'Untitled';
    let photoUrl = null;
    let membersCount = 0;
    let linkedChatId = null;
    let type = chatObj.type || ChannelType.CHANNEL;
    let isForum = !!chatObj.is_forum;
    let username = chatObj.username || null;

    try {
        const { token } = await this.botsService.getBotWithDecryptedToken(botId);
        const bot = new Telegraf(token);

        try {
            const chatInfo = await bot.telegram.getChat(channelId);
            const fullChat = chatInfo as any;
            
            title = fullChat.title || title;
            username = fullChat.username || username;
            type = fullChat.type; // supergroup, channel, group, private
            isForum = !!fullChat.is_forum;

            linkedChatId = fullChat.linked_chat_id 
                ? fullChat.linked_chat_id.toString() 
                : null;
            
            // If the chat itself is a forum (Supergroup with topics), it is its own link
            if (isForum) {
                linkedChatId = channelId;
            }

            if (chatInfo.photo) {
                const link = await bot.telegram.getFileLink(chatInfo.photo.big_file_id);
                photoUrl = link.toString();
            }
            membersCount = await bot.telegram.getChatMembersCount(channelId).catch(() => 0);
        } catch (apiError) {
            this.logger.warn(`API Sync failed for ${channelId} (${apiError.message}). Using Webhook payload data.`);
            // Fallback to webhook data
            if (chatObj.is_forum) {
                isForum = true;
                linkedChatId = channelId;
            }
        }

        const existing = await this.channelRepository.findOne({ where: { id: channelId } });
        
        if (existing) {
            existing.title = title;
            existing.username = username;
            existing.type = type;
            existing.isForum = isForum;
            existing.membersCount = membersCount > 0 ? membersCount : existing.membersCount;
            if (photoUrl) existing.photoUrl = photoUrl;
            if (linkedChatId) existing.linkedChatId = linkedChatId;
            existing.isActive = true;
            return this.channelRepository.save(existing);
        }

        const newChannel = this.channelRepository.create({
            id: channelId,
            title,
            username,
            type,
            isForum,
            photoUrl,
            membersCount,
            linkedChatId,
            ownerBotId: botId,
            isActive: true,
            settings: {}
        });

        return this.channelRepository.save(newChannel);

    } catch (error) {
        this.logger.error(`Failed to register channel ${channelId}: ${error.message}`);
        return null;
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
     const chatId = channelUsername.startsWith('@') || channelUsername.startsWith('-100') ? channelUsername : `@${channelUsername}`;

     try {
         const chat = await bot.telegram.getChat(chatId);
         const members = await bot.telegram.getChatMembersCount(chatId);
         return {
             id: chat.id.toString(),
             title: (chat as any).title,
             members,
             linkedChatId: (chat as any).linked_chat_id?.toString() || null,
             description: (chat as any).description,
             isForum: (chat as any).is_forum
         };
     } catch (e) {
         throw new BadRequestException(`Could not fetch channel: ${e.message}. Ensure bot is Admin.`);
     }
  }

  async addChannel(botId: string, channelId: string, title: string) {
     return this.registerChannelFromWebhook(botId, { id: channelId, title });
  }

  // === PRIVATE HELPERS ===

  private async verifyChannelAccess(userId: string, channelId: string, botId?: string) {
    const whereCondition: any = { id: channelId };
    if (botId) whereCondition.ownerBotId = botId;

    const channel = await this.channelRepository.findOne({ 
        where: whereCondition,
        relations: ['bot']
    });

    if (!channel) throw new NotFoundException('Channel not found');
    if (channel.bot.userId !== userId) throw new ForbiddenException('You do not own the bot managing this channel.');
    return channel;
  }

  private async toggleTopicState(userId: string, botId: string, channelId: string, topicId: string, method: 'closeForumTopic' | 'reopenForumTopic', closedState: boolean) {
    const channel = await this.verifyChannelAccess(userId, channelId, botId);
    const storedTopic = await this.topicRepository.findOne({ where: { id: topicId, channelId } });
    if (!storedTopic) throw new NotFoundException('Topic not found');
    
    const targetChatId = channel.isForum ? channel.id : channel.linkedChatId;
    if (!targetChatId) throw new BadRequestException('No chat found');

    const { token } = await this.botsService.getBotWithDecryptedToken(botId, userId);
    const bot = new Telegraf(token);

    try {
        await bot.telegram[method](targetChatId, storedTopic.telegramTopicId);
        storedTopic.isClosed = closedState;
        await this.topicRepository.save(storedTopic);
        return { success: true, isClosed: closedState };
    } catch (e) {
        throw new BadRequestException(`Failed to update topic state: ${e.message}`);
    }
  }
}
