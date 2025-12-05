import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { ChannelsController } from './channels.controller';
import { ChannelsService } from './channels.service';
import { ChannelSyncService } from './channel-sync.service';
import { Channel } from '../../database/entities/channel.entity';
import { BotsModule } from '../bots/bots.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Channel]),
    ScheduleModule.forRoot(), // Enable Cron
    forwardRef(() => BotsModule),
    AuthModule,
  ],
  controllers: [ChannelsController],
  providers: [ChannelsService, ChannelSyncService],
  exports: [ChannelsService],
})
export class ChannelsModule {}