import { Body, Controller, Post, HttpCode } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { TelegramService } from './telegram.service';

@ApiTags('Auth')
@Controller('auth')
export class TelegramController {
  constructor(
    private authService: AuthService,
    private telegramService: TelegramService
  ) {}

  @Post('webhook')
  @HttpCode(200)
  @ApiOperation({ summary: 'Handle Telegram webhook updates' })
  async handleWebhook(@Body() update: any) {
    // Basic check for message existence
    if (!update.message || !update.message.text) {
      return { status: 'ignored' };
    }

    const { chat, text } = update.message;
    const telegramId = chat.id.toString();

    // Logic: If user sends /start, we generate credentials
    if (text.trim() === '/start') {
      try {
        // 1. Generate new token
        const rawToken = await this.authService.registerOrRefreshToken(telegramId);

        // 2. Send credentials to user via Telegram
        await this.telegramService.sendWelcomeMessage(telegramId, rawToken);

      } catch (error) {
        console.error('Error processing /start:', error);
      }
    }

    return { status: 'ok' };
  }
}