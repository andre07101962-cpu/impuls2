
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BotsController } from './bots.controller';
import { BotUpdatesController } from './bot-updates.controller';
import { BotsService } from './bots.service';
import { UserBot } from '../../database/entities/user-bot.entity';
import { AuthModule } from '../auth/auth.module';
import { ChannelsModule } from '../channels/channels.module'; // Import ChannelsModule

@Module({
  imports: [
    TypeOrmModule.forFeature([UserBot]),
    AuthModule,
    ChannelsModule, // Add to imports
  ],
  controllers: [BotsController, BotUpdatesController],
  providers: [BotsService],
  exports: [BotsService],
})
export class BotsModule {}
