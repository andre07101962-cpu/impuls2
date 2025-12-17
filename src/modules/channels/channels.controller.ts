
import { Controller, Post, Get, Patch, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiProperty, ApiBearerAuth } from '@nestjs/swagger';
import { ChannelsService } from './channels.service';
import { IsString, IsNotEmpty, IsOptional, IsInt, IsBoolean, IsObject } from 'class-validator';
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

  @ApiProperty({ required: false })
  @IsInt()
  @IsOptional()
  expireDate?: number;

  @ApiProperty({ required: false })
  @IsInt()
  @IsOptional()
  limit?: number;
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

// === MODERATION DTOs ===

class ModerationActionDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  botId: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  channelId: string;

  @ApiProperty()
  @IsInt()
  @IsNotEmpty()
  targetUserId: number;
}

class BanUserDto extends ModerationActionDto {
  @ApiProperty({ required: false })
  @IsInt()
  @IsOptional()
  untilDate?: number;
}

class PromoteUserDto extends ModerationActionDto {
  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  customTitle?: string;

  @ApiProperty()
  @IsObject()
  permissions: any;
}

class SetPermissionsDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  botId: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  channelId: string;

  @ApiProperty()
  @IsObject()
  permissions: any;
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
    return this.channelsService.createInviteLink(user.id, dto.botId, dto.channelId, dto.name, dto.expireDate, dto.limit);
  }

  @Patch('profile')
  @ApiOperation({ summary: 'Update Channel Title or Description' })
  async updateProfile(@Body() dto: UpdateProfileDto, @CurrentUser() user: User) {
    return this.channelsService.updateChannelProfile(user.id, dto.botId, dto.channelId, {
      title: dto.title,
      description: dto.description
    });
  }

  @Post('permissions')
  @ApiOperation({ summary: 'Set Global Chat Permissions (Groups only)' })
  async setPermissions(@Body() dto: SetPermissionsDto, @CurrentUser() user: User) {
      return this.channelsService.setChatPermissions(user.id, dto.botId, dto.channelId, dto.permissions);
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

  // === MODERATION ===

  @Get(':channelId/admins')
  @ApiOperation({ summary: 'Get Admins (Live from Telegram)' })
  async getAdmins(@Param('channelId') channelId: string, @CurrentUser() user: User, @Body() body: { botId: string }) {
      // NOTE: Passing botId via Query or Body for GET is non-standard but required for multi-bot ownership check
      // Ideally, pass ?botId=...
      // For simplicity here assuming body or we can assume user has only one bot for this channel (expensive lookup)
      // Implementation assumes frontend sends botId in body for now (though GET body is discouraged)
      // BETTER: pass ?botId=XYZ in query params.
      return this.channelsService.getChatAdmins(user.id, body.botId, channelId);
  }

  @Post('ban')
  @ApiOperation({ summary: 'Ban a user from channel/group' })
  async ban(@Body() dto: BanUserDto, @CurrentUser() user: User) {
      return this.channelsService.banUser(user.id, dto.botId, dto.channelId, dto.targetUserId, dto.untilDate);
  }

  @Post('unban')
  @ApiOperation({ summary: 'Unban a user' })
  async unban(@Body() dto: ModerationActionDto, @CurrentUser() user: User) {
      return this.channelsService.unbanUser(user.id, dto.botId, dto.channelId, dto.targetUserId);
  }

  @Post('promote')
  @ApiOperation({ summary: 'Promote a user to Admin' })
  async promote(@Body() dto: PromoteUserDto, @CurrentUser() user: User) {
      return this.channelsService.promoteAdmin(user.id, dto.botId, dto.channelId, dto.targetUserId, dto.customTitle, dto.permissions);
  }

  @Post('leave')
  @ApiOperation({ summary: 'Bot leaves the channel' })
  async leave(@Body() dto: TopicActionDto, @CurrentUser() user: User) {
      return this.channelsService.leaveChannel(user.id, dto.botId, dto.channelId);
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
