import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ChannelsController } from './channels.controller';
import { ChannelsService } from './channels.service';
import { Channel } from '../../database/entities/channel.entity';
import { BotsModule } from '../bots/bots.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Channel]),
    BotsModule,
  ],
  controllers: [ChannelsController],
  providers: [ChannelsService],
  exports: [ChannelsService],
})
export class ChannelsModule {}