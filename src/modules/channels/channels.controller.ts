import { Controller, Post, Get, Patch, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiProperty, ApiBearerAuth } from '@nestjs/swagger';
import { ChannelsService } from './channels.service';
import { IsString, IsNotEmpty, IsOptional, IsInt, IsBoolean } from 'class-validator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { CurrentUser } from '../../common/decorators/user.decorator';
import { User } from '../../database/entities/user.entity';

class ChannelPreviewDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  botId: string;

  @ApiProperty({ example: '@my_channel' })
  @IsString()
  @IsNotEmpty()
  channelUsername: string;
}

class AddChannelDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  botId: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  channelId: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  title: string;
}

class SyncChannelsDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  botId: string;
}

class VerifyChannelDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  botId: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  channelId: string;
}

class CreateInviteDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  botId: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  channelId: string;

  @ApiProperty({ required: false, example: 'Campaign #1' })
  @IsString()
  @IsOptional()
  name?: string;
}

class UpdateProfileDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  botId: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  channelId: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  title?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  description?: string;
}

// === TOPIC DTOs ===

class CreateTopicDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  botId: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  channelId: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ required: false, description: 'RGB Int Color' })
  @IsInt()
  @IsOptional()
  iconColor?: number;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  iconEmojiId?: string;
}

class UpdateTopicDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  botId: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  channelId: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  iconEmojiId?: string;
}

class TopicActionDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  botId: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  channelId: string;
}

@ApiTags('Channels')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('channels')
export class ChannelsController {
  constructor(private channelsService: ChannelsService) {}

  @Get()
  @ApiOperation({ summary: 'List all channels managed by user bots' })
  async getChannels(@CurrentUser() user: User) {
    return this.channelsService.getUserChannels(user.id);
  }

  @Post('verify')
  @ApiOperation({ summary: 'Full Health Check: Verifies Admin rights, updates stats/photo' })
  async verify(@Body() dto: VerifyChannelDto, @CurrentUser() user: User) {
    return this.channelsService.verifyChannelHealth(user.id, dto.botId, dto.channelId);
  }

  @Post('invite-link')
  @ApiOperation({ summary: 'Create a tracked invite link' })
  async createInvite(@Body() dto: CreateInviteDto, @CurrentUser() user: User) {
    return this.channelsService.createInviteLink(user.id, dto.botId, dto.channelId, dto.name);
  }

  @Patch('profile')
  @ApiOperation({ summary: 'Update Channel Title or Description' })
  async updateProfile(@Body() dto: UpdateProfileDto, @CurrentUser() user: User) {
    return this.channelsService.updateChannelProfile(user.id, dto.botId, dto.channelId, {
      title: dto.title,
      description: dto.description
    });
  }

  @Post('sync')
  @ApiOperation({ summary: 'Auto-discover channels from Bot Updates' })
  async sync(@Body() dto: SyncChannelsDto) {
    return this.channelsService.syncChannels(dto.botId);
  }

  @Post('preview')
  @ApiOperation({ summary: 'Check if bot is admin and return channel info' })
  preview(@Body() dto: ChannelPreviewDto) {
    return this.channelsService.previewChannel(dto.botId, dto.channelUsername);
  }

  @Post('add')
  @ApiOperation({ summary: 'Save channel to DB' })
  add(@Body() dto: AddChannelDto) {
    return this.channelsService.addChannel(dto.botId, dto.channelId, dto.title);
  }

  // === TOPICS (FORUMS) ===

  @Get(':channelId/topics')
  @ApiOperation({ summary: 'Get cached topics for a channel' })
  async getTopics(@Param('channelId') channelId: string, @CurrentUser() user: User) {
      return this.channelsService.getChannelTopics(user.id, channelId);
  }

  @Post('topic')
  @ApiOperation({ summary: 'Create a new Forum Topic (Thread)' })
  async createTopic(@Body() dto: CreateTopicDto, @CurrentUser() user: User) {
      return this.channelsService.createTopic(user.id, dto.botId, dto.channelId, dto.name, dto.iconColor, dto.iconEmojiId);
  }

  @Patch('topic/:topicId')
  @ApiOperation({ summary: 'Edit Topic Name or Icon' })
  async editTopic(@Param('topicId') topicId: string, @Body() dto: UpdateTopicDto, @CurrentUser() user: User) {
      return this.channelsService.editTopic(user.id, dto.botId, dto.channelId, topicId, {
          name: dto.name,
          iconEmojiId: dto.iconEmojiId
      });
  }

  @Delete('topic/:topicId')
  @ApiOperation({ summary: 'Delete a topic completely' })
  async deleteTopic(@Param('topicId') topicId: string, @Body() dto: TopicActionDto, @CurrentUser() user: User) {
      return this.channelsService.deleteTopic(user.id, dto.botId, dto.channelId, topicId);
  }

  @Post('topic/:topicId/close')
  @ApiOperation({ summary: 'Close a topic (read-only)' })
  async closeTopic(@Param('topicId') topicId: string, @Body() dto: TopicActionDto, @CurrentUser() user: User) {
      return this.channelsService.closeTopic(user.id, dto.botId, dto.channelId, topicId);
  }

  @Post('topic/:topicId/reopen')
  @ApiOperation({ summary: 'Reopen a topic' })
  async reopenTopic(@Param('topicId') topicId: string, @Body() dto: TopicActionDto, @CurrentUser() user: User) {
      return this.channelsService.reopenTopic(user.id, dto.botId, dto.channelId, topicId);
  }
}
