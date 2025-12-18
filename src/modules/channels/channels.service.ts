
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
    // 🛠️ FIX: Use ForumTopic instead of Topic which was not imported/defined
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

  // === NEW: FETCH PERMISSIONS ===
  async getChatPermissions(userId: string, botId: string, channelId: string) {
    const { token } = await this.botsService.getBotWithDecryptedToken(botId, userId);
    const bot = new Telegraf(token);
    await this.verifyChannelAccess(userId, channelId, botId);

    try {
        const chat = await bot.telegram.getChat(channelId);
        // For groups/supergroups, permissions are in 'permissions' field
        return (chat as any).permissions || {
            can_send_messages: true,
            can_send_media_messages: true,
            can_send_polls: true,
            can_send_other_messages: true,
            can_add_web_page_previews: true,
            can_change_info: false,
            can_invite_users: true,
            can_pin_messages: false,
            can_manage_topics: false
        };
    } catch (e) {
        throw new BadRequestException(`Failed to fetch permissions: ${e.message}`);
    }
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
        if (updates.iconEmojiId !== undefined) storedTopic.iconCustomEmojiId = updates.iconEmojiId;
        
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

  async ensureTopicExists(botId: string, chatId: string, topicId: number) {
      let channel = await this.channelRepository.findOne({ where: { linkedChatId: chatId } });
      if (!channel) channel = await this.channelRepository.findOne({ where: { id: chatId } });
      if (!channel) return;

      const existing = await this.topicRepository.findOne({ 
          where: { channelId: channel.id, telegramTopicId: topicId } 
      });

      if (!existing) {
          const newTopic = this.topicRepository.create({
              channelId: channel.id,
              telegramTopicId: topicId,
              name: `Topic #${topicId}`,
              isClosed: false
          });
          await this.topicRepository.save(newTopic);
      }
  }

  async syncTopicFromWebhook(botId: string, chatId: string, data: { id: number, name?: string, iconColor?: number, iconCustomEmojiId?: string }) {
      let channel = await this.channelRepository.findOne({ where: { linkedChatId: chatId } });
      if (!channel) channel = await this.channelRepository.findOne({ where: { id: chatId } });
      if (!channel) return;

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
      if (data.iconColor !== undefined) topic.iconColor = data.iconColor;
      if (data.iconCustomEmojiId !== undefined) topic.iconCustomEmojiId = data.iconCustomEmojiId;

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

  async updateChannelPhoto(chatId: string, photoUrl: string | null) {
      let channel = await this.channelRepository.findOne({ where: { linkedChatId: chatId } });
      if (!channel) channel = await this.channelRepository.findOne({ where: { id: chatId } });
      if (channel) {
          channel.photoUrl = photoUrl;
          await this.channelRepository.save(channel);
      }
  }

  // === ADMIN TOOLS & GROWTH ===

  async createInviteLink(userId: string, botId: string, channelId: string, name?: string, expireDate?: number, limit?: number) {
     const { token } = await this.botsService.getBotWithDecryptedToken(botId, userId);
     const bot = new Telegraf(token);
     await this.verifyChannelAccess(userId, channelId, botId);

     try {
         return await bot.telegram.createChatInviteLink(channelId, {
             name: name || `Impulse Gen ${new Date().toISOString().split('T')[0]}`,
             expire_date: expireDate,
             member_limit: limit
         });
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
        if (updates.description !== undefined) {
            await bot.telegram.setChatDescription(channelId, updates.description);
            channel.description = updates.description;
        }
        await this.channelRepository.save(channel);
        return { success: true };
     } catch (e) {
         throw new BadRequestException(`Failed to update profile: ${e.message}`);
     }
  }

  async setChatPermissions(userId: string, botId: string, channelId: string, permissions: any) {
    const { token } = await this.botsService.getBotWithDecryptedToken(botId, userId);
    const bot = new Telegraf(token);
    await this.verifyChannelAccess(userId, channelId, botId);

    try {
        await bot.telegram.setChatPermissions(channelId, permissions);
        return { success: true };
    } catch (e) {
        throw new BadRequestException(`Failed to set permissions: ${e.message}`);
    }
  }

  async getChatAdmins(userId: string, botId: string, channelId: string) {
     const { token } = await this.botsService.getBotWithDecryptedToken(botId, userId);
     const bot = new Telegraf(token);
     await this.verifyChannelAccess(userId, channelId, botId);
     return await bot.telegram.getChatAdministrators(channelId);
  }

  async banUser(userId: string, botId: string, channelId: string, targetUserId: number, untilDate?: number) {
      const { token } = await this.botsService.getBotWithDecryptedToken(botId, userId);
      const bot = new Telegraf(token);
      await this.verifyChannelAccess(userId, channelId, botId);
      await bot.telegram.banChatMember(channelId, targetUserId, untilDate);
      return { success: true };
  }

  async unbanUser(userId: string, botId: string, channelId: string, targetUserId: number) {
      const { token } = await this.botsService.getBotWithDecryptedToken(botId, userId);
      const bot = new Telegraf(token);
      await this.verifyChannelAccess(userId, channelId, botId);
      await bot.telegram.unbanChatMember(channelId, targetUserId);
      return { success: true };
  }

  async leaveChannel(userId: string, botId: string, channelId: string) {
      const { token } = await this.botsService.getBotWithDecryptedToken(botId, userId);
      const bot = new Telegraf(token);
      const channel = await this.verifyChannelAccess(userId, channelId, botId);
      await bot.telegram.leaveChat(channelId);
      await this.channelRepository.update(channelId, { isActive: false });
      return { success: true };
  }

  async deactivateChannel(channelId: string) {
    await this.channelRepository.update(channelId, { isActive: false });
  }

  async verifyChannelHealth(userId: string, botId: string, channelId: string) {
    const { bot: userBot, token } = await this.botsService.getBotWithDecryptedToken(botId, userId);
    const telegraf = new Telegraf(token);

    try {
        const [chatInfo, chatMember, membersCount] = await Promise.all([
            telegraf.telegram.getChat(channelId),
            telegraf.telegram.getChatMember(channelId, parseInt(userBot.telegramBotId)),
            telegraf.telegram.getChatMembersCount(channelId)
        ]);

        if (chatMember.status !== 'administrator' && chatMember.status !== 'creator') {
            await this.deactivateChannel(channelId);
            throw new BadRequestException('Bot is not an Admin');
        }

        const channel = await this.channelRepository.findOne({ where: { id: channelId } });
        if (channel) {
            channel.title = (chatInfo as any).title;
            channel.membersCount = membersCount;
            channel.isActive = true;
            await this.channelRepository.save(channel);
            return { status: 'valid', data: channel };
        }
        throw new NotFoundException('Channel not found');
    } catch (error) {
        await this.deactivateChannel(channelId);
        throw new BadRequestException(error.message);
    }
  }

  async registerChannelFromWebhook(botId: string, chatObj: any) {
    const channelId = chatObj.id.toString();
    const existing = await this.channelRepository.findOne({ where: { id: channelId } });
    
    if (existing) {
        existing.title = chatObj.title || existing.title;
        existing.isActive = true;
        return this.channelRepository.save(existing);
    }

    const newChannel = this.channelRepository.create({
        id: channelId,
        title: chatObj.title || 'Untitled',
        type: chatObj.type || ChannelType.CHANNEL,
        ownerBotId: botId,
        isActive: true,
    });

    return this.channelRepository.save(newChannel);
  }

  private async verifyChannelAccess(userId: string, channelId: string, botId?: string) {
    const whereCondition: any = { id: channelId };
    if (botId) whereCondition.ownerBotId = botId;

    const channel = await this.channelRepository.findOne({ 
        where: whereCondition,
        relations: ['bot']
    });

    if (!channel) throw new NotFoundException('Channel not found');
    if (channel.bot.userId !== userId) throw new ForbiddenException('Access denied');
    return channel;
  }

  private async toggleTopicState(userId: string, botId: string, channelId: string, topicId: string, method: string, closedState: boolean) {
    const channel = await this.verifyChannelAccess(userId, channelId, botId);
    const storedTopic = await this.topicRepository.findOne({ where: { id: topicId, channelId } });
    if (!storedTopic) throw new NotFoundException('Topic not found');
    
    const targetChatId = channel.isForum ? channel.id : channel.linkedChatId;
    const { token } = await this.botsService.getBotWithDecryptedToken(botId, userId);
    const bot = new Telegraf(token);

    await (bot.telegram as any)[method](targetChatId, storedTopic.telegramTopicId);
    storedTopic.isClosed = closedState;
    await this.topicRepository.save(storedTopic);
    return { success: true };
  }
}
