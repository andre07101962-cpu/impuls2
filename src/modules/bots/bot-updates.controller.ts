import { Controller, Post, Body, Param, HttpCode, Logger } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { BotsService } from './bots.service';
import { ChannelsService } from '../channels/channels.service';
import axios from 'axios';

@ApiTags('Bot Updates')
@Controller('bots/webhook')
export class BotUpdatesController {
  private readonly logger = new Logger(BotUpdatesController.name);

  constructor(
    private botsService: BotsService,
    private channelsService: ChannelsService, // Inject ChannelsService
  ) {}

  @Post(':botId')
  @HttpCode(200)
  @ApiOperation({ summary: 'Handle Telegram Webhook for User Bots' })
  async handleUpdates(@Param('botId') botId: string, @Body() update: any) {
    try {
      // 1. Handle /start command
      if (update.message && update.message.text) {
        const text = update.message.text;
        const chatId = update.message.chat.id;
        if (text.trim() === '/start') {
          await this.handleStartCommand(botId, chatId);
        }
      }

      // 2. Handle 'my_chat_member' (Bot added/removed as Admin)
      // This is the Event-Driven Sync logic
      if (update.my_chat_member) {
        const { chat, new_chat_member } = update.my_chat_member;
        
        // A. Bot Promoted to Administrator -> ADD CHANNEL
        if (new_chat_member.status === 'administrator') {
            this.logger.log(`Bot ${botId} promoted to admin in ${chat.title} (${chat.id})`);
            await this.channelsService.registerChannelFromWebhook(botId, chat);
        }

        // B. Bot Kicked / Left / Restricted -> REMOVE CHANNEL
        else if (['kicked', 'left', 'restricted'].includes(new_chat_member.status)) {
            this.logger.warn(`Bot ${botId} removed from channel ${chat.title} (${chat.id}). Status: ${new_chat_member.status}`);
            await this.channelsService.deactivateChannel(chat.id.toString());
        }
      }

    } catch (error) {
      this.logger.error(`Error handling webhook for bot ${botId}: ${error.message}`);
    }

    return { status: 'ok' };
  }

  private async handleStartCommand(botId: string, chatId: string | number) {
    const { bot, token } = await this.botsService.getBotWithDecryptedToken(botId);
    const welcomeMessage = bot.config?.welcomeMessage || 'Hello! I am managed by Impulse.';
    await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
      chat_id: chatId,
      text: welcomeMessage,
      parse_mode: 'HTML'
    });
  }
}