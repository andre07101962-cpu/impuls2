
import { Injectable, BadRequestException, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserBot, BotStatus } from '../../database/entities/user-bot.entity';
import { EncryptionUtil } from '../../common/utils/encryption.util';
import axios from 'axios';

@Injectable()
export class BotsService {
  private readonly logger = new Logger(BotsService.name);
  // Hardcoded URL as requested, in production this should come from config
  private readonly baseUrl = 'https://impyls.onrender.com';

  constructor(
    @InjectRepository(UserBot)
    private botRepository: Repository<UserBot>,
  ) {}

  /**
   * Get all bots belonging to a user
   */
  async getUserBots(userId: string): Promise<UserBot[]> {
    return this.botRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' }
    });
  }

  /**
   * Validates token with Telegram and saves to DB linked to user
   */
  async addBot(token: string, userId: string) {
    // 1. Validate token
    let botInfo;
    try {
      const response = await axios.get(`https://api.telegram.org/bot${token}/getMe`);
      if (!response.data.ok) {
        throw new Error('Invalid Token');
      }
      botInfo = response.data.result;
    } catch (error) {
      throw new BadRequestException('Invalid Telegram Bot Token or Telegram API unavailable');
    }

    // 2. Check duplicates
    const telegramBotId = botInfo.id.toString();
    const existingBot = await this.botRepository.findOne({ where: { telegramBotId } });
    
    if (existingBot) {
      if (existingBot.userId !== userId) {
        throw new BadRequestException('Bot is already connected to another account.');
      }
      throw new BadRequestException('Bot already connected.');
    }

    // 3. Encrypt & Save
    const newBot = this.botRepository.create({
      telegramBotId,
      username: botInfo.username,
      tokenEncrypted: EncryptionUtil.encrypt(token),
      userId,
      status: BotStatus.ACTIVE,
      config: { welcomeMessage: 'Hello! I am managed by Impulse.' }, // Default config
      stats: {}
    });

    const savedBot = await this.botRepository.save(newBot);

    // 4. Set Webhook
    await this.setWebhook(token, savedBot.id);

    return savedBot;
  }

  async getBotWithDecryptedToken(botId: string): Promise<{ bot: UserBot; token: string }> {
    const bot = await this.botRepository.findOne({ where: { id: botId } });
    if (!bot) throw new NotFoundException('Bot not found');
    if (bot.status !== BotStatus.ACTIVE) throw new BadRequestException('Bot is not active');
    const token = EncryptionUtil.decrypt(bot.tokenEncrypted);
    return { bot, token };
  }

  /**
   * Update bot configuration (e.g. welcome message)
   */
  async updateBotConfig(botId: string, userId: string, updates: any) {
    const bot = await this.botRepository.findOne({ where: { id: botId, userId } });
    if (!bot) throw new NotFoundException('Bot not found or access denied');

    // Merge existing config with updates
    bot.config = { ...bot.config, ...updates };
    return this.botRepository.save(bot);
  }

  private async setWebhook(token: string, botId: string) {
    const webhookUrl = `${this.baseUrl}/bots/webhook/${botId}`;
    try {
      await axios.post(`https://api.telegram.org/bot${token}/setWebhook?url=${webhookUrl}`);
      this.logger.log(`Webhook set for bot ${botId} -> ${webhookUrl}`);
    } catch (e) {
      this.logger.error(`Failed to set webhook for bot ${botId}: ${e.message}`);
      // Non-blocking error, we still return the saved bot
    }
  }
}
