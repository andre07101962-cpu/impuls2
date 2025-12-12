import { Controller, Post, Patch, Get, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiProperty, ApiBearerAuth } from '@nestjs/swagger';
import { PublisherService } from './publisher.service';
import { IsArray, IsString, IsNotEmpty, IsObject, IsOptional, IsEnum } from 'class-validator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { CurrentUser } from '../../common/decorators/user.decorator';
import { User } from '../../database/entities/user.entity';

// We duplicate the Enum here for Swagger clarity
enum PostType {
  POST = 'post',
  STORY = 'story',
  PAID_MEDIA = 'paid_media',
}

class SchedulePostDto {
  @ApiProperty({ 
    example: { 
        text: "Hidden Content", 
        media: ["https://..."], 
        paid_config: { star_count: 50 },
        options: { has_spoiler: true }
    },
    description: "Supports standard posts, stories, and paid media objects"
  })
  @IsObject()
  content: any;

  @ApiProperty({ enum: PostType, required: false, default: PostType.POST })
  @IsOptional()
  @IsEnum(PostType)
  type?: PostType;

  @ApiProperty({ example: ['-100123456789'] })
  @IsArray()
  channelIds: string[];

  @ApiProperty({ example: '2025-12-25T10:00:00.000Z' })
  @IsString()
  @IsNotEmpty()
  publishAt: string;
}

class EditPostDto {
  @ApiProperty({ required: false })
  @IsObject()
  @IsOptional()
  content?: any;

  @ApiProperty({ required: false })
  @IsArray()
  @IsOptional()
  channelIds?: string[];

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  publishAt?: string;
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
  @ApiOperation({ summary: 'Schedule a post (Feed, Story, or Paid Media)' })
  schedule(@Body() dto: SchedulePostDto) {
    // Inject the 'type' into the content payload for persistence if not already there
    const contentWithType = { ...dto.content, type: dto.type || PostType.POST };
    
    // We pass the raw content (which now includes type) to the service
    // The service saves this whole blob into post.contentPayload
    // However, we also need to save post.type in the entity column for filtering
    return this.publisherService.schedulePost(contentWithType, dto.channelIds, dto.publishAt);
  }

  @Patch('schedule/:id')
  @ApiOperation({ summary: 'Edit a scheduled post (Time, Content, or Channels)' })
  edit(@Param('id') id: string, @Body() dto: EditPostDto) {
    return this.publisherService.editScheduledPost(id, dto);
  }
}