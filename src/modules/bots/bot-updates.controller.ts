
import { Controller, Post, Body, Param, HttpCode, Logger } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { BotsService } from './bots.service';
import axios from 'axios';

@ApiTags('Bot Updates')
@Controller('bots/webhook')
export class BotUpdatesController {
  private readonly logger = new Logger(BotUpdatesController.name);

  constructor(private botsService: BotsService) {}

  @Post(':botId')
  @HttpCode(200)
  @ApiOperation({ summary: 'Handle Telegram Webhook for User Bots' })
  async handleUpdates(@Param('botId') botId: string, @Body() update: any) {
    // Always return 200 to prevent Telegram from retrying infinite loops on error
    try {
      if (!update.message || !update.message.text) {
        return { status: 'ignored' };
      }

      const text = update.message.text;
      const chatId = update.message.chat.id;

      if (text.trim() === '/start') {
        await this.handleStartCommand(botId, chatId);
      }
    } catch (error) {
      this.logger.error(`Error handling webhook for bot ${botId}: ${error.message}`);
    }

    return { status: 'ok' };
  }

  private async handleStartCommand(botId: string, chatId: string | number) {
    // 1. Get Bot & Token
    const { bot, token } = await this.botsService.getBotWithDecryptedToken(botId);

    // 2. Get Welcome Message from Config
    const welcomeMessage = bot.config?.welcomeMessage || 'Hello! I am managed by Impulse.';

    // 3. Send Message
    await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
      chat_id: chatId,
      text: welcomeMessage,
      parse_mode: 'HTML'
    });
  }
}
