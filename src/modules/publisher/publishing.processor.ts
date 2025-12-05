import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job, UnrecoverableError } from 'bullmq';
import { Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ScheduledPublication, PublicationStatus } from '../../database/entities/scheduled-publication.entity';
import { Channel } from '../../database/entities/channel.entity';
import { BotsService } from '../bots/bots.service';
import axios from 'axios';

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
      // 2. Decrypt Token
      const { token } = await this.botsService.getBotWithDecryptedToken(publication.channel.ownerBotId);
      
      // 3. Prepare Payload
      const chatId = publication.channel.id;
      const content = publication.post.contentPayload; 
      const apiUrl = `https://api.telegram.org/bot${token}`;

      let res;

      // Simple logic: Photo vs Text
      if (content.media) {
        res = await axios.post(`${apiUrl}/sendPhoto`, {
          chat_id: chatId,
          photo: content.media,
          caption: content.text,
          parse_mode: 'HTML'
        });
      } else {
        res = await axios.post(`${apiUrl}/sendMessage`, {
          chat_id: chatId,
          text: content.text,
          parse_mode: 'HTML'
        });
      }

      // 4. Update Success
      publication.status = PublicationStatus.PUBLISHED;
      publication.tgMessageId = res.data.result.message_id;
      publication.publishAt = new Date(); 
      await this.publicationRepository.save(publication);

      this.logger.log(`Published to ${chatId} (MsgID: ${publication.tgMessageId})`);

    } catch (error: any) {
      this.logger.error(`Failed to publish ${publicationId}: ${error.message}`);

      // Handle Telegram 429: Too Many Requests
      if (error.response && error.response.status === 429) {
        const retryAfter = error.response.data?.parameters?.retry_after || 5; // Default 5s if missing
        this.logger.warn(`Telegram Rate Limit hit. Retrying after ${retryAfter}s`);
        
        // Move job to delayed state to respect retry_after
        await job.moveToDelayed(Date.now() + (retryAfter * 1000) + 100, job.token);
        return; 
      }

      // Handle Telegram 403: Forbidden (Bot blocked or kicked)
      if (error.response && error.response.status === 403) {
        this.logger.warn(`Bot was kicked from channel ${publication.channel.id}. Marking channel as inactive.`);
        
        // Deactivate Channel
        await this.channelRepository.update(publication.channel.id, { isActive: false });

        // Mark publication failed
        publication.status = PublicationStatus.FAILED;
        await this.publicationRepository.save(publication);

        // Do not retry
        throw new UnrecoverableError('Bot kicked from channel');
      }
      
      // General Failure
      publication.status = PublicationStatus.FAILED;
      await this.publicationRepository.save(publication);
      
      // Throwing error causes BullMQ to use standard backoff if configured, or fail
      throw error; 
    }
  }
}