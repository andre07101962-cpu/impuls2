import { Controller, Post, Patch, Get, Delete, Body, Param, UseGuards, BadRequestException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiProperty, ApiBearerAuth } from '@nestjs/swagger';
import { PublisherService } from './publisher.service';
import { IsArray, IsString, IsNotEmpty, IsObject, IsOptional, IsEnum, IsBoolean, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { AuthGuard } from '../../common/guards/auth.guard';
import { CurrentUser } from '../../common/decorators/user.decorator';
import { User } from '../../database/entities/user.entity';

enum PostType {
  POST = 'post',
  STORY = 'story',
  PAID_MEDIA = 'paid_media',
  POLL = 'poll',
  DOCUMENT = 'document',
}

// Helper DTO for deeper validation (Optional but recommended)
class ContentPayloadDto {
    @IsOptional()
    text?: string;
    
    @IsOptional()
    media?: any;

    @IsOptional()
    question?: string; // For Polls

    @IsOptional()
    poll_options?: string[]; // For Polls
}

class SchedulePostDto {
  @ApiProperty({ 
    example: { 
        text: "Hidden Content", 
        media: ["https://..."], 
        paid_config: { star_count: 50 },
        options: { has_spoiler: true, pin: true }
    },
    description: "Supports standard posts, stories, polls, documents and paid media objects"
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

  @ApiProperty({ example: '2025-12-26T10:00:00.000Z', required: false, description: 'Auto-delete time (Self-destruct)' })
  @IsString()
  @IsOptional()
  deleteAt?: string;
}

class EditPostDto {
  @ApiProperty({ required: false })
  @IsObject()
  @IsOptional()
  content?: any;

  @ApiProperty({ enum: PostType, required: false, description: 'Allow changing type during edit' })
  @IsOptional()
  @IsEnum(PostType)
  type?: PostType;

  @ApiProperty({ required: false })
  @IsArray()
  @IsOptional()
  channelIds?: string[];

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  publishAt?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  deleteAt?: string;

  @ApiProperty({ required: false, description: 'If true, attempts to edit the message in Telegram immediately (if already published)' })
  @IsBoolean()
  @IsOptional()
  isLiveEdit?: boolean;
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
  @ApiOperation({ summary: 'Schedule a post (Feed, Story, Poll, Doc, or Paid Media)' })
  schedule(@Body() dto: SchedulePostDto) {
    // 🛡️ LOGIC VALIDATION: Prevent incompatible types before DB save
    this.validateContent(dto.content, dto.type || PostType.POST);

    // Inject the 'type' into the content payload for persistence if not already there
    const contentWithType = { ...dto.content, type: dto.type || PostType.POST };
    return this.publisherService.schedulePost(contentWithType, dto.channelIds, dto.publishAt, dto.deleteAt);
  }

  @Patch('schedule/:id')
  @ApiOperation({ summary: 'Edit a scheduled post (Time, Content, or Channels). Supports Live Edit.' })
  edit(@Param('id') id: string, @Body() dto: EditPostDto) {
    // Adapter: If type is provided at root, ensure it's merged into content for the service logic
    if (dto.type && dto.content) {
        this.validateContent(dto.content, dto.type);
        dto.content.type = dto.type;
    } else if (dto.type && !dto.content) {
        return this.publisherService.editScheduledPost(id, { ...dto, content: { type: dto.type } });
    }
    return this.publisherService.editScheduledPost(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a post. If scheduled: cancels. If published: deletes from Telegram.' })
  delete(@Param('id') id: string, @CurrentUser() user: User) {
    return this.publisherService.deletePost(user.id, id);
  }

  // 🛡️ INTERNAL VALIDATOR
  private validateContent(content: any, type: PostType) {
      if (!content) return;

      if (type === PostType.POLL) {
          if (!content.question) throw new BadRequestException('Poll must have a question');
          // Check for 'poll_options' specifically, NOT 'options'
          if (!content.poll_options || !Array.isArray(content.poll_options) || content.poll_options.length < 2) {
              throw new BadRequestException('Poll must have at least 2 poll_options');
          }
      }
      if (type === PostType.PAID_MEDIA) {
          if (!content.paid_config || !content.paid_config.star_count) {
              throw new BadRequestException('Paid Media must have star_count');
          }
      }
      if (type === PostType.STORY) {
          if (!content.media) throw new BadRequestException('Story must have media');
      }
  }
}