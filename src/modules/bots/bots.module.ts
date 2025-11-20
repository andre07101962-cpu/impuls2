
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BotsController } from './bots.controller';
import { BotsService } from './bots.service';
import { UserBot } from '../../database/entities/user-bot.entity';

@Module({
  imports: [TypeOrmModule.forFeature([UserBot])],
  controllers: [BotsController],
  providers: [BotsService],
  exports: [BotsService],
})
export class BotsModule {}
