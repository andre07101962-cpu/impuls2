
import { Controller, Post, Body } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiProperty } from '@nestjs/swagger';
import { ChannelsService } from './channels.service';
import { IsString, IsNotEmpty } from 'class-validator';

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

@ApiTags('Channels')
@Controller('channels')
export class ChannelsController {
  constructor(private channelsService: ChannelsService) {}

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
