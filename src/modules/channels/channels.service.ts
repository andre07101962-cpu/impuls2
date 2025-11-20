
import { Injectable, BadRequestException, Logger, NotFoundException } from '@nestjs/common';
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

  /**
   * Get channels owned by any of the user's bots
   */
  async getUserChannels(userId: string) {
    // Find channels where the owner bot belongs to the user
    return this.channelRepository.createQueryBuilder('channel')
      .leftJoinAndSelect('channel.bot', 'bot')
      .where('bot.userId = :userId', { userId })
      .getMany();
  }

  /**
   * Checks if bot is admin and returns info
   */
  async previewChannel(botId: string, channelUsername: string) {
    const { bot, token } = await this.botsService.getBotWithDecryptedToken(botId);
    const apiUrl = `https://api.telegram.org/bot${token}`;
    
    const chatId = channelUsername.startsWith('@') || channelUsername.startsWith('-100') 
      ? channelUsername 
      : `@${channelUsername}`;

    try {
      const chatRes = await axios.get(`${apiUrl}/getChat?chat_id=${chatId}`);
      const chat = chatRes.data.result;

      if (chat.type !== 'channel' && chat.type !== 'supergroup') {
        throw new BadRequestException('Target is not a channel or supergroup');
      }

      // Check Admin Rights
      const adminsRes = await axios.get(`${apiUrl}/getChatAdministrators?chat_id=${chat.id}`);
      const admins = adminsRes.data.result;
      const botAdminEntry = admins.find((a: any) => a.user.username === bot.username);

      if (!botAdminEntry) {
        throw new BadRequestException(`Bot @${bot.username} is not an administrator.`);
      }

      return {
        id: chat.id.toString(),
        title: chat.title,
        username: chat.username,
        photoUrl: null, // Implement getFileLink if needed
        membersCount: await this.getMembersCount(apiUrl, chat.id),
      };

    } catch (error) {
        if (error instanceof BadRequestException) throw error;
        throw new BadRequestException(`Failed to fetch channel: ${error.response?.data?.description || error.message}`);
    }
  }

  async addChannel(botId: string, channelId: string, title: string) {
    const existing = await this.channelRepository.findOne({ where: { id: channelId } });
    if (existing) throw new BadRequestException('Channel already added.');

    const channel = this.channelRepository.create({
        id: channelId,
        title: title,
        ownerBotId: botId,
        settings: {}, 
    });

    return this.channelRepository.save(channel);
  }

  /**
   * Tries to discover channels by checking bot updates
   */
  async syncChannels(botId: string) {
    const { bot, token } = await this.botsService.getBotWithDecryptedToken(botId);
    const apiUrl = `https://api.telegram.org/bot${token}`;
    
    let updates;
    try {
        const res = await axios.get(`${apiUrl}/getUpdates`);
        updates = res.data.result;
    } catch (e) {
        throw new BadRequestException('Failed to fetch updates from Telegram');
    }

    const foundChannels = [];
    
    for (const update of updates) {
        // Logic: Look for 'my_chat_member' (bot added to channel) or 'channel_post'
        const chat = update.my_chat_member?.chat || update.channel_post?.chat;
        
        if (chat && (chat.type === 'channel' || chat.type === 'supergroup')) {
            // Check if we already have it
            const exists = await this.channelRepository.findOne({ where: { id: chat.id.toString() } });
            if (!exists) {
                // Verify admin status specifically
                try {
                    const adminsRes = await axios.get(`${apiUrl}/getChatAdministrators?chat_id=${chat.id}`);
                    const admins = adminsRes.data.result;
                    const isAdmin = admins.some((a: any) => a.user.username === bot.username);
                    
                    if (isAdmin) {
                        const newChannel = await this.channelRepository.save({
                            id: chat.id.toString(),
                            title: chat.title || 'Untitled',
                            ownerBotId: bot.id,
                            settings: {}
                        });
                        foundChannels.push(newChannel);
                    }
                } catch (e) {
                    // Ignore errors (bot might have been kicked)
                }
            }
        }
    }

    return { synced: foundChannels.length, channels: foundChannels };
  }

  private async getMembersCount(apiUrl: string, chatId: string | number): Promise<number> {
    try {
      const res = await axios.get(`${apiUrl}/getChatMemberCount?chat_id=${chatId}`);
      return res.data.result;
    } catch (e) {
      return 0;
    }
  }
}
