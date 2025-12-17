
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
  AUDIO = 'audio',
  VOICE = 'voice',
  VIDEO_NOTE = 'video_note',
  LOCATION = 'location',
  CONTACT = 'contact',
  STICKER = 'sticker',
  COPY = 'copy',
  FORWARD = 'forward',
}

class SchedulePostDto {
  @ApiProperty({ 
    example: { 
        text: "Hello World", 
        media: ["https://..."], 
        options: { has_spoiler: true, pin: true, show_caption_above_media: true }
    },
    description: "Flexible payload depending on type"
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

  @ApiProperty({ example: '2025-12-26T10:00:00.000Z', required: false })
  @IsString()
  @IsOptional()
  deleteAt?: string;
}

class EditPostDto {
  @ApiProperty({ required: false })
  @IsObject()
  @IsOptional()
  content?: any;

  @ApiProperty({ enum: PostType, required: false })
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

  @ApiProperty({ required: false })
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
  @ApiOperation({ summary: 'Schedule any type of Telegram content' })
  schedule(@Body() dto: SchedulePostDto) {
    this.validateContent(dto.content, dto.type || PostType.POST);
    const contentWithType = { ...dto.content, type: dto.type || PostType.POST };
    return this.publisherService.schedulePost(contentWithType, dto.channelIds, dto.publishAt, dto.deleteAt);
  }

  @Patch('schedule/:id')
  @ApiOperation({ summary: 'Edit a scheduled post (Time, Content, or Channels). Supports Live Edit.' })
  edit(@Param('id') id: string, @Body() dto: EditPostDto) {
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
      if (type === PostType.COPY || type === PostType.FORWARD) {
          if (!content.from_chat_id || !content.message_id) {
              throw new BadRequestException('Copy/Forward must have from_chat_id and message_id');
          }
      }
      if (type === PostType.LOCATION) {
           if (!content.latitude || !content.longitude) throw new BadRequestException('Location requires latitude and longitude');
      }
      if (type === PostType.CONTACT) {
           if (!content.phone_number || !content.first_name) throw new BadRequestException('Contact requires phone_number and first_name');
      }
  }
}
