import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ChannelsController } from './channels.controller';
import { ChannelsService } from './channels.service';
import { Channel } from '../../database/entities/channel.entity';
import { BotsModule } from '../bots/bots.module';
import { AuthModule } from '../auth/auth.module'; // <--- FIXED: Needed for AuthGuard

@Module({
  imports: [
    TypeOrmModule.forFeature([Channel]),
    forwardRef(() => BotsModule), // Use forwardRef if circular dependency exists, else standard import
    AuthModule,
  ],
  controllers: [ChannelsController],
  providers: [ChannelsService],
  exports: [ChannelsService],
})
export class ChannelsModule {}