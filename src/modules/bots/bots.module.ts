import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BotsController } from './bots.controller';
import { BotUpdatesController } from './bot-updates.controller';
import { BotsService } from './bots.service';
import { UserBot } from '../../database/entities/user-bot.entity';
import { AuthModule } from '../auth/auth.module'; // <--- FIXED: Needed for AuthGuard
import { ChannelsModule } from '../channels/channels.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([UserBot]),
    AuthModule, 
    ChannelsModule, // For auto-syncing channels on webhook events
  ],
  controllers: [BotsController, BotUpdatesController],
  providers: [BotsService],
  exports: [BotsService],
})
export class BotsModule {}