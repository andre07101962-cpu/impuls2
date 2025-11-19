import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import axios from 'axios';

@Injectable()
export class TelegramService implements OnModuleInit {
  private readonly logger = new Logger(TelegramService.name);
  private readonly botToken = process.env.MASTER_BOT_TOKEN;
  private readonly apiUrl = `https://api.telegram.org/bot${this.botToken}`;

  async onModuleInit() {
    if (!this.botToken) {
      this.logger.error('❌ MASTER_BOT_TOKEN is missing in .env! Bot features will not work.');
      return;
    }

    try {
      const response = await axios.get(`${this.apiUrl}/getMe`);
      const botName = response.data.result.username;
      this.logger.log(`✅ Telegram Bot Configured: @${botName}`);
    } catch (error) {
      this.logger.error('⚠️ Invalid MASTER_BOT_TOKEN or Telegram API unreachable.');
    }
  }

  async sendWelcomeMessage(chatId: string, token: string) {
    if (!this.botToken) {
        this.logger.warn('Cannot send message: Bot token missing.');
        return;
    }

    const message = `
<b>Welcome to Impulse! 🚀</b>

Your account has been initialized.
Please use the credentials below to log in to the dashboard:

👤 <b>Login ID:</b> <code>${chatId}</code>
🔑 <b>Access Token:</b> <code>${token}</code>

<i>⚠️ Keep this token safe. It is your password. Type /start to generate a new one if lost.</i>
    `;

    try {
      await axios.post(`${this.apiUrl}/sendMessage`, {
        chat_id: chatId,
        text: message,
        parse_mode: 'HTML',
      });
      this.logger.log(`Sent login credentials to chat ${chatId}`);
    } catch (error) {
      this.logger.error(`Failed to send message to ${chatId}: ${error.message}`);
    }
  }
}