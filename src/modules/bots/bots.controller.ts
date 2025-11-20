
import { Controller, Post, Get, Patch, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiProperty, ApiBearerAuth } from '@nestjs/swagger';
import { BotsService } from './bots.service';
import { IsString, IsNotEmpty, IsOptional, IsObject } from 'class-validator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { CurrentUser } from '../../common/decorators/user.decorator';
import { User } from '../../database/entities/user.entity';

class CreateBotDto {
  @ApiProperty({ example: '123456:ABC...', description: 'Telegram Bot Token' })
  @IsString()
  @IsNotEmpty()
  token: string;
}

class UpdateBotConfigDto {
  @ApiProperty({ example: 'Welcome to my shop!', description: 'Custom welcome message for /start' })
  @IsString()
  @IsOptional()
  welcomeMessage?: string;
}

@ApiTags('Bots')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('bots')
export class BotsController {
  constructor(private botsService: BotsService) {}

  @Get()
  @ApiOperation({ summary: 'List all connected bots' })
  async getBots(@CurrentUser() user: User) {
    return this.botsService.getUserBots(user.id);
  }

  @Post()
  @ApiOperation({ summary: 'Connect a new Telegram Bot (BYOB)' })
  async addBot(@Body() dto: CreateBotDto, @CurrentUser() user: User) {
    const newBot = await this.botsService.addBot(dto.token, user.id);
    
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

  @Patch(':id/config')
  @ApiOperation({ summary: 'Update bot configuration (e.g. welcome message)' })
  async updateConfig(
    @Param('id') id: string,
    @Body() dto: UpdateBotConfigDto,
    @CurrentUser() user: User
  ) {
    return this.botsService.updateBotConfig(id, user.id, dto);
  }
}
