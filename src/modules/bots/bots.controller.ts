
import { Controller, Post, Body } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiProperty } from '@nestjs/swagger';
import { BotsService } from './bots.service';
import { IsString, IsNotEmpty } from 'class-validator';

class CreateBotDto {
  @ApiProperty({ example: '123456:ABC...', description: 'Telegram Bot Token' })
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
  constructor(private botsService: BotsService) {}

  @Post()
  @ApiOperation({ summary: 'Connect a new Telegram Bot (BYOB)' })
  async addBot(@Body() dto: CreateBotDto) {
    const newBot = await this.botsService.addBot(dto.token, dto.userId);
    
    return {
      success: true,
      data: {
        id: newBot.id,
        username: newBot.username,
        telegramBotId: newBot.telegramBotId,
        status: newBot.status,
      },
    };
  }
}
