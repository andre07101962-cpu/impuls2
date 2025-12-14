import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { BullModule } from '@nestjs/bullmq'; // <--- Added BullMQ
import { ChannelsController } from './channels.controller';
import { ChannelsService } from './channels.service';
import { ChannelSyncService } from './channel-sync.service';
import { ChannelSyncProcessor } from './channel-sync.processor'; // <--- New Worker
import { Channel } from '../../database/entities/channel.entity';
import { BotsModule } from '../bots/bots.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Channel]),
    ScheduleModule.forRoot(),
    // 🚀 SCALABILITY: Register Queue for Sync
    BullModule.registerQueue({
      name: 'channel-sync',
    }),
    forwardRef(() => BotsModule),
    AuthModule,
  ],
  controllers: [ChannelsController],
  providers: [
    ChannelsService, 
    ChannelSyncService, 
    ChannelSyncProcessor // <--- Registered Worker
  ],
  exports: [ChannelsService],
})
export class ChannelsModule {}