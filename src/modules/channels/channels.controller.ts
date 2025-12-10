
import { Controller, Post, Get, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiProperty, ApiBearerAuth } from '@nestjs/swagger';
import { ChannelsService } from './channels.service';
import { IsString, IsNotEmpty } from 'class-validator';
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
    // This performs a "Full Circle" check
    return this.channelsService.verifyChannelHealth(user.id, dto.botId, dto.channelId);
  }

  @Post('sync')
  @ApiOperation({ summary: 'Auto-discover channels from Bot Updates' })
  async sync(@Body() dto: SyncChannelsDto) {
    // Check if bot belongs to user is handled inside service logic conceptually, 
    // but ideally we verify ownership here or in service. Service verifies bot exists.
    // TODO: Add check in service that botId belongs to user.
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
