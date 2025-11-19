import { Controller, Post, Body, BadRequestException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiProperty } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserBot, BotStatus } from '../../database/entities/user-bot.entity';
import { EncryptionUtil } from '../../common/utils/encryption.util';
import axios from 'axios';
import { IsString, IsNotEmpty } from 'class-validator';

class CreateBotDto {
  @ApiProperty({ example: '123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11', description: 'Telegram Bot Token' })
  @IsString()
  @IsNotEmpty()
  token: string;
  
  @ApiProperty({ example: 'user-uuid-123', description: 'Owner User ID' })
  @IsString()
  @IsNotEmpty()
  userId: string; 
}

@ApiTags('Bots')
@Controller('bots')
export class BotsController {
  constructor(
    @InjectRepository(UserBot)
    private botRepository: Repository<UserBot>,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Connect a new Telegram Bot (BYOB)' })
  async addBot(@Body() dto: CreateBotDto) {
    // 1. Validate token with Telegram API
    let botInfo;
    try {
      const response = await axios.get(`https://api.telegram.org/bot${dto.token}/getMe`);
      if (!response.data.ok) {
        throw new Error('Invalid Token');
      }
      botInfo = response.data.result;
    } catch (error) {
      throw new BadRequestException('Invalid Telegram Bot Token or Telegram API unavailable');
    }

    // 2. Encrypt the token
    const encryptedToken = EncryptionUtil.encrypt(dto.token);

    // 3. Save to UserBot table
    const telegramBotId = botInfo.id.toString();

    // Check if bot already exists
    const existingBot = await this.botRepository.findOne({
      where: { telegramBotId },
    });

    if (existingBot) {
        if (existingBot.userId !== dto.userId) {
           throw new BadRequestException('Bot is already connected to another account.');
        }
        throw new BadRequestException('Bot already connected.');
    }

    try {
        const newBot = this.botRepository.create({
            telegramBotId,
            username: botInfo.username,
            tokenEncrypted: encryptedToken,
            userId: dto.userId,
            config: {},
            status: BotStatus.ACTIVE,
        });

        await this.botRepository.save(newBot);

        return {
            success: true,
            data: {
                id: newBot.id,
                username: newBot.username,
                telegramBotId: newBot.telegramBotId,
                status: newBot.status,
            },
        };
    } catch (error) {
        console.error(error);
        throw new BadRequestException('Failed to save bot configuration.');
    }
  }
}