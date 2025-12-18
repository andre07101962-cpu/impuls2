
import { Controller, Post, Get, Patch, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiProperty, ApiBearerAuth } from '@nestjs/swagger';
import { ChannelsService } from './channels.service';
import { IsString, IsNotEmpty, IsOptional, IsInt, IsObject } from 'class-validator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { CurrentUser } from '../../common/decorators/user.decorator';
import { User } from '../../database/entities/user.entity';

@ApiTags('Channels')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('channels')
export class ChannelsController {
  constructor(private channelsService: ChannelsService) {}

  @Get()
  @ApiOperation({ summary: 'List all channels' })
  async getChannels(@CurrentUser() user: User) {
    return this.channelsService.getUserChannels(user.id);
  }

  // === FIX: GET PERMISSIONS (WAS 404) ===
  @Get(':channelId/permissions')
  @ApiOperation({ summary: 'Get current chat permissions' })
  async getPermissions(
    @Param('channelId') channelId: string,
    @Query('botId') botId: string,
    @CurrentUser() user: User
  ) {
    return this.channelsService.getChatPermissions(user.id, botId, channelId);
  }

  // === FIX: GET ADMINS (USE QUERY INSTEAD OF BODY) ===
  @Get(':channelId/admins')
  @ApiOperation({ summary: 'Get Admins live from Telegram' })
  async getAdmins(
    @Param('channelId') channelId: string,
    @Query('botId') botId: string,
    @CurrentUser() user: User
  ) {
    return this.channelsService.getChatAdmins(user.id, botId, channelId);
  }

  @Post('verify')
  async verify(@Body() dto: any, @CurrentUser() user: User) {
    return this.channelsService.verifyChannelHealth(user.id, dto.botId, dto.channelId);
  }

  @Post('permissions')
  async setPermissions(@Body() dto: any, @CurrentUser() user: User) {
      return this.channelsService.setChatPermissions(user.id, dto.botId, dto.channelId, dto.permissions);
  }

  // === TOPICS ===
  @Get(':channelId/topics')
  async getTopics(@Param('channelId') channelId: string, @CurrentUser() user: User) {
      return this.channelsService.getChannelTopics(user.id, channelId);
  }

  @Post('topic')
  async createTopic(@Body() dto: any, @CurrentUser() user: User) {
      return this.channelsService.createTopic(user.id, dto.botId, dto.channelId, dto.name, dto.iconColor, dto.iconEmojiId);
  }

  @Patch('topic/:topicId')
  async editTopic(@Param('topicId') topicId: string, @Body() dto: any, @CurrentUser() user: User) {
      return this.channelsService.editTopic(user.id, dto.botId, dto.channelId, topicId, dto);
  }

  @Post('topic/:topicId/close')
  async closeTopic(@Param('topicId') topicId: string, @Body() dto: any, @CurrentUser() user: User) {
      return this.channelsService.closeTopic(user.id, dto.botId, dto.channelId, topicId);
  }

  @Post('topic/:topicId/reopen')
  async reopenTopic(@Param('topicId') topicId: string, @Body() dto: any, @CurrentUser() user: User) {
      return this.channelsService.reopenTopic(user.id, dto.botId, dto.channelId, topicId);
  }
}
