
import { Body, Controller, Post, HttpCode, Headers, UnauthorizedException, Logger } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { TelegramService } from './telegram.service';

@ApiTags('Auth')
@Controller('auth')
export class TelegramController {
  private logger = new Logger('TelegramWebhook');

  constructor(
    private authService: AuthService,
    private telegramService: TelegramService
  ) {}

  @Post('webhook')
  @HttpCode(200)
  @ApiOperation({ summary: 'Handle Telegram webhook updates' })
  async handleWebhook(
    @Body() update: any,
    @Headers('x-telegram-bot-api-secret-token') secretToken: string
  ) {
    // 🔍 RAW LOGGING: Print everything Telegram sends
    this.logger.debug(`📥 INCOMING TELEGRAM PAYLOAD:\n${JSON.stringify(update, null, 2)}`);

    // 🛡️ SECURITY: Verify request comes from Telegram
    const configuredSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
    if (configuredSecret && secretToken !== configuredSecret) {
        this.logger.warn('🛑 Blocked unauthorized webhook attempt');
        throw new UnauthorizedException('Invalid Secret Token');
    }

    // Basic check for message existence
    if (!update.message || !update.message.text) {
      return { status: 'ignored' };
    }

    const { chat, text, from } = update.message;
    const telegramId = chat.id.toString();

    // Logic: If user sends /start, we generate credentials
    if (text.trim().startsWith('/start')) {
      this.logger.log(`🚀 Processing /start for ID: ${telegramId}`);
      try {
        // 1. Generate new token & Save ALL data
        const rawToken = await this.authService.registerOrRefreshToken({
            id: telegramId,
            first_name: from.first_name,
            last_name: from.last_name,
            username: from.username,
            language_code: from.language_code,
            is_premium: from.is_premium,
            raw_data: from // Save the raw user object
        });

        // 2. Send credentials to user via Telegram
        await this.telegramService.sendWelcomeMessage(telegramId, rawToken);

      } catch (error) {
        this.logger.error('Error processing /start:', error);
      }
    }

    return { status: 'ok' };
  }
}
