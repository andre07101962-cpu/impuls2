import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { TelegramController } from './telegram.controller';
import { TelegramService } from './telegram.service';
import { User } from '../../database/entities/user.entity';
import { AuthSession } from '../../database/entities/auth-session.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, AuthSession]),
  ],
  controllers: [AuthController, TelegramController],
  providers: [AuthService, TelegramService],
  exports: [AuthService],
})
export class AuthModule {}