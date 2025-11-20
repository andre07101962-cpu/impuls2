
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ScheduledPublication, PublicationStatus } from '../../database/entities/scheduled-publication.entity';
import { BotsService } from '../bots/bots.service';
import axios from 'axios';

@Processor('publishing')
export class PublishingProcessor extends WorkerHost {
  private readonly logger = new Logger(PublishingProcessor.name);

  constructor(
    @InjectRepository(ScheduledPublication)
    private publicationRepository: Repository<ScheduledPublication>,
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
      const content = publication.post.contentPayload; // Assuming { text: "...", media: "..." }
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
      publication.publishAt = new Date(); // Actual publish time
      await this.publicationRepository.save(publication);

      this.logger.log(`Published to ${chatId} (MsgID: ${publication.tgMessageId})`);

    } catch (error) {
      this.logger.error(`Failed to publish ${publicationId}: ${error.message}`);
      
      publication.status = PublicationStatus.FAILED;
      await this.publicationRepository.save(publication);
      
      // Don't rethrow if we don't want to retry automatically
      // throw error; 
    }
  }
}
