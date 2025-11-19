import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BotsController } from './bots.controller';
import { UserBot } from '../../database/entities/user-bot.entity';

@Module({
  imports: [TypeOrmModule.forFeature([UserBot])],
  controllers: [BotsController],
  providers: [],
})
export class BotsModule {}