
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
      // 1. Find the parent channel/group
      let channel = await this.channelRepository.findOne({ where: { linkedChatId: chatId } });
      if (!channel) channel = await this.channelRepository.findOne({ where: { id: chatId } });

      if (!channel) return;

      // 2. Check if topic already known
      const existing = await this.topicRepository.findOne({ 
          where: { channelId: channel.id, telegramTopicId: topicId } 
      });

      if (!existing) {
          this.logger.log(`👻 Discovered existing topic #${topicId} in ${channel.title}. Registering...`);
          const newTopic = this.topicRepository.create({
              channelId: channel.id,
              telegramTopicId: topicId,
              name: `Topic #${topicId} (Edit name to sync)`, // Placeholder name
              isClosed: false
          });
          await this.topicRepository.save(newTopic);
      }
  }

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

      // 🛡️ FIX: Use strict checks (!== undefined) to allow clearing values or partial updates
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

      // If topic doesn't exist but we got a close event, we might as well create it
      if (!topic && isClosed) {
          await this.syncTopicFromWebhook(channel.ownerBotId, chatId, { id: topicId, name: `Topic #${topicId}` });
          return;
      }

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
          this.logger.log(`📸 Updated photo for ${channel.title}: ${photoUrl ? 'New Photo' : 'Deleted'}`);
      }
  }

  // === ADMIN TOOLS & GROWTH ===

  async createInviteLink(userId: string, botId: string, channelId: string, name?: string, expireDate?: number, limit?: number) {
     const { token } = await this.botsService.getBotWithDecryptedToken(botId, userId);
     const bot = new Telegraf(token);
     await this.verifyChannelAccess(userId, channelId, botId);

     try {
         const invite = await bot.telegram.createChatInviteLink(channelId, {
             name: name || `Impulse Gen ${new Date().toISOString().split('T')[0]}`,
             expire_date: expireDate,
             member_limit: limit,
             creates_join_request: false
         });
         return invite;
     } catch (e) {
         throw new BadRequestException(`Telegram Error: ${e.message}`);
     }
  }

  async revokeInviteLink(userId: string, botId: string, channelId: string, inviteLink: string) {
     const { token } = await this.botsService.getBotWithDecryptedToken(botId, userId);
     const bot = new Telegraf(token);
     await this.verifyChannelAccess(userId, channelId, botId);

     try {
         const result = await bot.telegram.revokeChatInviteLink(channelId, inviteLink);
         return result;
     } catch (e) {
         throw new BadRequestException(`Failed to revoke link: ${e.message}`);
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
        return { success: true, message: 'Profile updated' };
     } catch (e) {
         throw new BadRequestException(`Failed to update profile: ${e.message}. Bot needs Administrator rights.`);
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

  // === MODERATION (NEW) ===

  async getChatAdmins(userId: string, botId: string, channelId: string) {
     const { token } = await this.botsService.getBotWithDecryptedToken(botId, userId);
     const bot = new Telegraf(token);
     await this.verifyChannelAccess(userId, channelId, botId);
     
     try {
         return await bot.telegram.getChatAdministrators(channelId);
     } catch (e) {
         throw new BadRequestException(`Failed to fetch admins: ${e.message}`);
     }
  }

  async banUser(userId: string, botId: string, channelId: string, targetUserId: number, untilDate?: number) {
      const { token } = await this.botsService.getBotWithDecryptedToken(botId, userId);
      const bot = new Telegraf(token);
      await this.verifyChannelAccess(userId, channelId, botId);

      try {
          await bot.telegram.banChatMember(channelId, targetUserId, untilDate);
          return { success: true, message: `User ${targetUserId} banned.` };
      } catch (e) {
          throw new BadRequestException(`Failed to ban user: ${e.message}`);
      }
  }

  async unbanUser(userId: string, botId: string, channelId: string, targetUserId: number) {
      const { token } = await this.botsService.getBotWithDecryptedToken(botId, userId);
      const bot = new Telegraf(token);
      await this.verifyChannelAccess(userId, channelId, botId);

      try {
          await bot.telegram.unbanChatMember(channelId, targetUserId);
          return { success: true, message: `User ${targetUserId} unbanned.` };
      } catch (e) {
          throw new BadRequestException(`Failed to unban user: ${e.message}`);
      }
  }

  async restrictUser(userId: string, botId: string, channelId: string, targetUserId: number, permissions: any, untilDate?: number) {
      const { token } = await this.botsService.getBotWithDecryptedToken(botId, userId);
      const bot = new Telegraf(token);
      await this.verifyChannelAccess(userId, channelId, botId);

      try {
          // Telegraf restrictChatMember signature: chat_id, user_id, permissions (with params)
          // Fix for "Expected 3 arguments, but got 4"
          await bot.telegram.restrictChatMember(channelId, targetUserId, { ...permissions, until_date: untilDate } as any);
          return { success: true, message: `User ${targetUserId} restricted.` };
      } catch (e) {
          throw new BadRequestException(`Failed to restrict user: ${e.message}`);
      }
  }

  async promoteAdmin(userId: string, botId: string, channelId: string, targetUserId: number, customTitle: string, permissions: any) {
      const { token } = await this.botsService.getBotWithDecryptedToken(botId, userId);
      const bot = new Telegraf(token);
      await this.verifyChannelAccess(userId, channelId, botId);

      try {
          await bot.telegram.promoteChatMember(channelId, targetUserId, { ...permissions, is_anonymous: false });
          if (customTitle) {
              await bot.telegram.setChatAdministratorCustomTitle(channelId, targetUserId, customTitle);
          }
          return { success: true, message: `User ${targetUserId} promoted.` };
      } catch (e) {
          throw new BadRequestException(`Failed to promote user: ${e.message}`);
      }
  }

  async leaveChannel(userId: string, botId: string, channelId: string) {
      const { token } = await this.botsService.getBotWithDecryptedToken(botId, userId);
      const bot = new Telegraf(token);
      const channel = await this.verifyChannelAccess(userId, channelId, botId);

      try {
          await bot.telegram.leaveChat(channelId);
          await this.channelRepository.update(channelId, { isActive: false });
          return { success: true, message: 'Bot left the channel' };
      } catch (e) {
          throw new BadRequestException(`Failed to leave chat: ${e.message}`);
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
            channel.description = (chatInfo as any).description; // Sync description
            channel.type = (chatInfo as any).type;
            channel.isForum = !!(chatInfo as any).is_forum;
            channel.membersCount = membersCount;
            // Always update photo, even if null (removed)
            channel.photoUrl = photoUrl;
            
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
    
    this.logger.debug(`📥 REGISTERING CHANNEL [${channelId}]: ${JSON.stringify(chatObj, null, 2)}`);

    const existing = await this.channelRepository.findOne({ where: { id: channelId } });

    let title = chatObj.title || 'Untitled';
    let photoUrl = null;
    let description = chatObj.description || null;
    let membersCount = 0;
    
    let linkedChatId = existing ? existing.linkedChatId : null;
    
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
            description = fullChat.description || description; // Get bio
            type = fullChat.type; 
            isForum = !!fullChat.is_forum;

            if (fullChat.linked_chat_id) {
                linkedChatId = fullChat.linked_chat_id.toString();
                this.logger.log(`🔗 FOUND LINKED CHAT for ${channelId}: ${linkedChatId}`);
            } else {
                if (isForum) {
                    linkedChatId = channelId;
                } else if (fullChat.type === 'channel') {
                    linkedChatId = null;
                }
            }

            if (chatInfo.photo) {
                const link = await bot.telegram.getFileLink(chatInfo.photo.big_file_id);
                photoUrl = link.toString();
            }
            membersCount = await bot.telegram.getChatMembersCount(channelId).catch(() => 0);
        } catch (apiError) {
            this.logger.warn(`API Sync failed for ${channelId} (${apiError.message}). Using Webhook/DB payload.`);
            if (chatObj.is_forum) {
                isForum = true;
                linkedChatId = channelId;
            }
        }
        
        if (existing) {
            existing.title = title;
            existing.username = username;
            existing.description = description;
            existing.type = type;
            existing.isForum = isForum;
            existing.membersCount = membersCount > 0 ? membersCount : existing.membersCount;
            // Always update photo (allows removal)
            existing.photoUrl = photoUrl;
            
            existing.linkedChatId = linkedChatId; 
            existing.isActive = true;
            return this.channelRepository.save(existing);
        }

        const newChannel = this.channelRepository.create({
            id: channelId,
            title,
            username,
            description,
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
