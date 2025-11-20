import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { PublisherController } from './publisher.controller';
import { PublisherService } from './publisher.service';
import { PublishingProcessor } from './publishing.processor';
import { Post } from '../../database/entities/post.entity';
import { ScheduledPublication } from '../../database/entities/scheduled-publication.entity';
import { Channel } from '../../database/entities/channel.entity';
import { BotsModule } from '../bots/bots.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Post, ScheduledPublication, Channel]),
    BullModule.registerQueue({
      name: 'publishing',
    }),
    BotsModule,
  ],
  controllers: [PublisherController],
  providers: [PublisherService, PublishingProcessor],
  exports: [PublisherService],
})
export class PublisherModule {}