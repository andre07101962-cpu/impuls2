
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

  /**
   * Checks if bot is admin in channel and returns info
   */
  async previewChannel(botId: string, channelUsername: string) {
    // 1. Get Decrypted Token
    const { bot, token } = await this.botsService.getBotWithDecryptedToken(botId);
    const apiUrl = `https://api.telegram.org/bot${token}`;
    
    // Normalize username (must start with @ or be -100 ID)
    const chatId = channelUsername.startsWith('@') || channelUsername.startsWith('-100') 
      ? channelUsername 
      : `@${channelUsername}`;

    try {
      // 2. Get Chat Info
      const chatRes = await axios.get(`${apiUrl}/getChat?chat_id=${chatId}`);
      const chat = chatRes.data.result;

      if (chat.type !== 'channel' && chat.type !== 'supergroup') {
        throw new BadRequestException('Target is not a channel or supergroup');
      }

      // 3. Check Admin Rights
      // We fetch administrators to see if our bot is one of them
      const adminsRes = await axios.get(`${apiUrl}/getChatAdministrators?chat_id=${chat.id}`);
      const admins = adminsRes.data.result;

      const botAdminEntry = admins.find((a: any) => a.user.username === bot.username);

      if (!botAdminEntry) {
        throw new BadRequestException(`Bot @${bot.username} is not an administrator in this channel.`);
      }

      // Check specific permissions if needed (can_post_messages, etc.)
      if (!botAdminEntry.can_post_messages && chat.type === 'channel') {
        throw new BadRequestException('Bot does not have "Post Messages" permission.');
      }

      // 4. Return Preview
      return {
        id: chat.id.toString(), // -100123456789
        title: chat.title,
        username: chat.username,
        photoUrl: chat.photo ? await this.getFileLink(token, chat.photo.big_file_id) : null,
        membersCount: await this.getMembersCount(apiUrl, chat.id),
      };

    } catch (error) {
      this.logger.error(`Preview failed: ${error.message}`);
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException(`Failed to fetch channel info. Ensure bot is admin. details: ${error.response?.data?.description || error.message}`);
    }
  }

  async addChannel(botId: string, channelId: string, title: string) {
    const existing = await this.channelRepository.findOne({ where: { id: channelId } });
    if (existing) {
        throw new BadRequestException('Channel already added.');
    }

    const channel = this.channelRepository.create({
        id: channelId,
        title: title,
        ownerBotId: botId,
        settings: {}, 
    });

    return this.channelRepository.save(channel);
  }

  // --- Helpers ---

  private async getFileLink(token: string, fileId: string): Promise<string | null> {
    try {
      const res = await axios.get(`https://api.telegram.org/bot${token}/getFile?file_id=${fileId}`);
      const filePath = res.data.result.file_path;
      return `https://api.telegram.org/file/bot${token}/${filePath}`;
    } catch (e) {
      return null;
    }
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
