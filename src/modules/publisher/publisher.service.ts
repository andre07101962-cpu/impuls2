
import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Post } from '../../database/entities/post.entity';
import { ScheduledPublication, PublicationStatus } from '../../database/entities/scheduled-publication.entity';
import { Channel } from '../../database/entities/channel.entity';

@Injectable()
export class PublisherService {
  constructor(
    @InjectRepository(Post)
    private postRepository: Repository<Post>,
    @InjectRepository(ScheduledPublication)
    private publicationRepository: Repository<ScheduledPublication>,
    @InjectRepository(Channel)
    private channelRepository: Repository<Channel>,
    @InjectQueue('publishing') private publishingQueue: Queue,
  ) {}

  async schedulePost(content: any, channelIds: string[], publishAtIso: string) {
    const publishDate = new Date(publishAtIso);
    const now = new Date();

    if (publishDate < now) {
        // Optionally allow immediate publishing if time is close, 
        // but for scheduling strictly future dates:
        // throw new BadRequestException('Publish date must be in the future');
    }

    // 1. Create Post (Template)
    const post = this.postRepository.create({
      contentPayload: content,
      name: `Post ${new Date().toISOString()}`,
    });
    await this.postRepository.save(post);

    // 2. Validate Channels
    const channels = await this.channelRepository.findBy({
        id: In(channelIds) // TypeORM handles BigInt mapping usually, check BigInt config
    });

    if (channels.length !== channelIds.length) {
        throw new BadRequestException('Some channels were not found.');
    }

    // 3. Create Publications & Schedule Jobs
    const publications = [];

    for (const channel of channels) {
      const pub = this.publicationRepository.create({
        post,
        channel,
        publishAt: publishDate,
        status: PublicationStatus.SCHEDULED,
      });
      await this.publicationRepository.save(pub);
      publications.push(pub);

      // Calculate delay
      const delay = Math.max(0, publishDate.getTime() - Date.now());

      // Add to Bull Queue
      await this.publishingQueue.add(
        'send-post', 
        { publicationId: pub.id },
        { delay, removeOnComplete: true }
      );
    }

    return {
      success: true,
      postId: post.id,
      scheduledCount: publications.length,
      publishAt: publishDate,
    };
  }
}
