import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthService } from './auth.service';
import { TelegramService } from './telegram.service';
import { TelegramController } from './telegram.controller';
import { AuthController } from './auth.controller';
import { User } from '../../database/entities/user.entity';

@Module({
  imports: [TypeOrmModule.forFeature([User])],
  controllers: [TelegramController, AuthController],
  providers: [AuthService, TelegramService],
  exports: [AuthService],
})
export class AuthModule {}