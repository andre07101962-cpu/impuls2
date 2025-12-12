import { Controller, Post, Get, Patch, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiProperty, ApiBearerAuth } from '@nestjs/swagger';
import { ChannelsService } from './channels.service';
import { IsString, IsNotEmpty, IsOptional } from 'class-validator';
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
}