
import { Controller, Post, Get, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiProperty, ApiBearerAuth } from '@nestjs/swagger';
import { PublisherService } from './publisher.service';
import { IsArray, IsString, IsNotEmpty, IsObject } from 'class-validator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { CurrentUser } from '../../common/decorators/user.decorator';
import { User } from '../../database/entities/user.entity';

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
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('publisher')
export class PublisherController {
  constructor(private publisherService: PublisherService) {}

  @Get('publications')
  @ApiOperation({ summary: 'Get all scheduled and past publications for Calendar' })
  async getPublications(@CurrentUser() user: User) {
    return this.publisherService.getPublicationsByUser(user.id);
  }

  @Post('schedule')
  @ApiOperation({ summary: 'Schedule a post for multiple channels' })
  schedule(@Body() dto: SchedulePostDto) {
    return this.publisherService.schedulePost(dto.content, dto.channelIds, dto.publishAt);
  }
}
