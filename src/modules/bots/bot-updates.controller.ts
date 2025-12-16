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
    private channelsService: ChannelsService, 
  ) {}

  @Post(':botId')
  @HttpCode(200)
  @ApiOperation({ summary: 'Handle Telegram Webhook for User Bots' })
  async handleUpdates(@Param('botId') botId: string, @Body() update: any) {
    // 1. 🔍 DEEP LOGGING: Print the exact payload from Telegram (Enable in Dev)
    if (process.env.NODE_ENV !== 'production' || true) { 
        this.logger.debug(`📥 WEBHOOK PAYLOAD [${botId}]: ${JSON.stringify(update, null, 2)}`);
    }

    try {
      // 2. Handle 'my_chat_member' (Bot added/removed/promoted)
      if (update.my_chat_member) {
        const { chat, new_chat_member } = update.my_chat_member;
        
        if (new_chat_member.status === 'administrator') {
            this.logger.log(`Bot ${botId} promoted to admin in ${chat.title} (${chat.id})`);
            await this.channelsService.registerChannelFromWebhook(botId, chat);
        }
        else if (['kicked', 'left', 'restricted'].includes(new_chat_member.status)) {
            this.logger.warn(`Bot ${botId} removed from channel ${chat.title} (${chat.id})`);
            await this.channelsService.deactivateChannel(chat.id.toString());
        }
      }

      // 3. Handle 'channel_post' (New Post in Channel -> Trigger Sync)
      if (update.channel_post) {
          const post = update.channel_post;
          
          // A. Regular Channel Sync
          await this.channelsService.registerChannelFromWebhook(botId, post.chat);

          // B. Handle Channel Renaming (Service Message)
          if (post.new_chat_title) {
              this.logger.log(`📝 Channel Renamed: ${post.new_chat_title}`);
              await this.channelsService.registerChannelFromWebhook(botId, { ...post.chat, title: post.new_chat_title });
          }
          if (post.new_chat_photo) {
              this.logger.log(`📸 Channel Photo Changed`);
              await this.channelsService.registerChannelFromWebhook(botId, post.chat); // Will fetch new photo URL
          }
      }

      // 4. Handle Messages & Service Events (Groups/Supergroups/Private)
      if (update.message) {
        const msg = update.message;
        const chatId = msg.chat.id.toString();

        // A. Handle /start
        if (msg.text && msg.text.trim() === '/start') {
          await this.handleStartCommand(botId, chatId);
        }

        // B. Handle Group/Supergroup Renaming (Service Message)
        if (msg.new_chat_title) {
             this.logger.log(`📝 Group Renamed: ${msg.new_chat_title}`);
             await this.channelsService.registerChannelFromWebhook(botId, { ...msg.chat, title: msg.new_chat_title });
        }
        if (msg.new_chat_photo) {
             this.logger.log(`📸 Group Photo Changed`);
             await this.channelsService.registerChannelFromWebhook(botId, msg.chat);
        }

        // C. Handle Topic Creation
        if (msg.forum_topic_created) {
            this.logger.log(`📢 Topic Created Manually: ${msg.forum_topic_created.name} in ${chatId}`);
            await this.channelsService.syncTopicFromWebhook(botId, chatId, {
                id: msg.message_thread_id,
                name: msg.forum_topic_created.name,
                iconColor: msg.forum_topic_created.icon_color,
                iconCustomEmojiId: msg.forum_topic_created.icon_custom_emoji_id
            });
        }

        // D. Handle Topic Edited
        else if (msg.forum_topic_edited) {
             this.logger.log(`📢 Topic Edited Manually: ${chatId} / ${msg.message_thread_id}`);
             await this.channelsService.syncTopicFromWebhook(botId, chatId, {
                id: msg.message_thread_id,
                name: msg.forum_topic_edited.name,
                iconCustomEmojiId: msg.forum_topic_edited.icon_custom_emoji_id
            });
        }

        // E. Handle Topic Closed
        else if (msg.forum_topic_closed) {
            this.logger.log(`📢 Topic Closed: ${chatId} / ${msg.message_thread_id}`);
            await this.channelsService.updateTopicStatus(chatId, msg.message_thread_id, true);
        }

        // F. Handle Topic Reopened
        else if (msg.forum_topic_reopened) {
            this.logger.log(`📢 Topic Reopened: ${chatId} / ${msg.message_thread_id}`);
            await this.channelsService.updateTopicStatus(chatId, msg.message_thread_id, false);
        }

        // G. 🚀 Passive Discovery: Detect Existing Topics via Regular Messages
        else if (msg.message_thread_id) {
             await this.channelsService.ensureTopicExists(botId, chatId, msg.message_thread_id);
        }
      }

    } catch (error) {
      this.logger.error(`Error handling webhook for bot ${botId}: ${error.message}`);
    }

    return { status: 'ok' };
  }

  private async handleStartCommand(botId: string, chatId: string | number) {
    try {
        const { bot, token } = await this.botsService.getBotWithDecryptedToken(botId);
        const welcomeMessage = bot.config?.welcomeMessage || 'Hello! I am managed by Impulse.';
        await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
        chat_id: chatId,
        text: welcomeMessage,
        parse_mode: 'HTML'
        });
    } catch (e) {
        // Ignore start errors
    }
  }
}