import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job, UnrecoverableError } from 'bullmq';
import { Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ScheduledPublication, PublicationStatus } from '../../database/entities/scheduled-publication.entity';
import { Channel } from '../../database/entities/channel.entity';
import { BotsService } from '../bots/bots.service';
import { Telegraf, TelegramError } from 'telegraf';
import { InputMediaPhoto } from 'telegraf/types';

@Processor('publishing', {
  limiter: {
    max: 20,
    duration: 1000,
  },
})
export class PublishingProcessor extends WorkerHost {
  private readonly logger = new Logger(PublishingProcessor.name);

  constructor(
    @InjectRepository(ScheduledPublication)
    private publicationRepository: Repository<ScheduledPublication>,
    @InjectRepository(Channel)
    private channelRepository: Repository<Channel>,
    private botsService: BotsService,
  ) {
    super();
  }

  async process(job: Job<{ publicationId: string }>) {
    const { publicationId } = job.data;
    this.logger.log(`Processing publication ${publicationId}`);

    // 1. Fetch Full Context
    const publication = await this.publicationRepository.findOne({
      where: { id: publicationId },
      relations: ['post', 'channel', 'channel.bot'],
    });

    if (!publication) {
      this.logger.error('Publication not found');
      return;
    }

    try {
      // 2. Initialize Telegraf
      const { token } = await this.botsService.getBotWithDecryptedToken(publication.channel.ownerBotId);
      const bot = new Telegraf(token);
      
      const chatId = publication.channel.id;
      const content = publication.post.contentPayload; 
      
      // 3. Construct Keyboard (if any)
      let reply_markup = undefined;
      if (content.buttons && Array.isArray(content.buttons)) {
          // Assuming content.buttons is [[{text, url}]]
          reply_markup = { inline_keyboard: content.buttons };
      }

      let resultMessage;

      // 4. Send Content based on Type
      // CASE A: Media Album (Multiple Images)
      if (content.media && Array.isArray(content.media) && content.media.length > 1) {
          const mediaGroup: InputMediaPhoto[] = content.media.map((url, index) => ({
              type: 'photo',
              media: url,
              // Caption only goes on the first item in an album usually, or strictly defined
              caption: index === 0 ? content.text : '', 
              parse_mode: 'HTML'
          }));
          
          const msgs = await bot.telegram.sendMediaGroup(chatId, mediaGroup);
          resultMessage = msgs[0]; // Take the first message ID as reference
      } 
      // CASE B: Single Photo
      else if (content.media && (typeof content.media === 'string' || (Array.isArray(content.media) && content.media.length === 1))) {
          const photo = Array.isArray(content.media) ? content.media[0] : content.media;
          resultMessage = await bot.telegram.sendPhoto(chatId, photo, {
              caption: content.text,
              parse_mode: 'HTML',
              reply_markup
          });
      } 
      // CASE C: Text Only
      else {
          resultMessage = await bot.telegram.sendMessage(chatId, content.text, {
              parse_mode: 'HTML',
              reply_markup,
              // Disable web preview if explicitly requested, otherwise default
              link_preview_options: { is_disabled: false }
          });
      }

      // 5. Update Success
      publication.status = PublicationStatus.PUBLISHED;
      publication.tgMessageId = resultMessage.message_id.toString();
      publication.publishAt = new Date(); 
      await this.publicationRepository.save(publication);

      this.logger.log(`Published to ${chatId} (MsgID: ${publication.tgMessageId})`);

    } catch (error: any) {
      this.logger.error(`Failed to publish ${publicationId}: ${error.message}`);

      // Handle Telegram Specific Errors via Telegraf types or Error checks
      const retryAfter = error?.parameters?.retry_after;
      
      // Rate Limit (429)
      if (retryAfter) {
        this.logger.warn(`Telegram Rate Limit hit. Retrying after ${retryAfter}s`);
        await job.moveToDelayed(Date.now() + (retryAfter * 1000) + 1000, job.token);
        return; 
      }

      // Bot Blocked / Kicked (403)
      if (error.response && error.response.error_code === 403) {
        this.logger.warn(`Bot was kicked from channel ${publication.channel.id}. Marking channel as inactive.`);
        
        await this.channelRepository.update(publication.channel.id, { isActive: false });
        
        publication.status = PublicationStatus.FAILED;
        await this.publicationRepository.save(publication);
        throw new UnrecoverableError('Bot kicked from channel');
      }
      
      // General Failure
      publication.status = PublicationStatus.FAILED;
      await this.publicationRepository.save(publication);
      
      throw error; 
    }
  }
}