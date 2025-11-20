
import { Controller, Post, Body } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiProperty } from '@nestjs/swagger';
import { PublisherService } from './publisher.service';
import { IsArray, IsString, IsNotEmpty, IsObject } from 'class-validator';

class SchedulePostDto {
  @ApiProperty({ example: { text: "Hello World", media: "https://..." } })
  @IsObject()
  content: any;

  @ApiProperty({ example: ['-100123456789'] })
  @IsArray()
  channelIds: string[];

  @ApiProperty({ example: '2025-12-25T10:00:00.000Z' })
  @IsString()
  @IsNotEmpty()
  publishAt: string;
}

@ApiTags('Publisher')
@Controller('publisher')
export class PublisherController {
  constructor(private publisherService: PublisherService) {}

  @Post('schedule')
  @ApiOperation({ summary: 'Schedule a post for multiple channels' })
  schedule(@Body() dto: SchedulePostDto) {
    return this.publisherService.schedulePost(dto.content, dto.channelIds, dto.publishAt);
  }
}
