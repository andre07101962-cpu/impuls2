
import { 
  Controller, 
  Post, 
  UseInterceptors, 
  UploadedFile, 
  UseGuards, 
  BadRequestException 
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiConsumes, ApiBody, ApiBearerAuth } from '@nestjs/swagger';
import { MediaService } from './media.service';
import { AuthGuard } from '../../common/guards/auth.guard';
import { CurrentUser } from '../../common/decorators/user.decorator';
import { User } from '../../database/entities/user.entity';

@ApiTags('Media')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('media')
export class MediaController {
  constructor(private readonly mediaService: MediaService) {}

  @Post('upload')
  @ApiOperation({ summary: 'Upload a file (Image/Video/Doc) to Supabase Storage' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  @UseInterceptors(FileInterceptor('file', {
    limits: {
      fileSize: 50 * 1024 * 1024, // 50MB limit
    },
    fileFilter: (req, file, callback) => {
      // Allow images, videos, audios, and documents
      if (!file.mimetype.match(/\/(jpg|jpeg|png|gif|mp4|mpeg|ogg|mp3|pdf|zip|msword)$/)) {
        return callback(new BadRequestException('Unsupported file type'), false);
      }
      callback(null, true);
    },
  }))
  // 🛠️ FIX: Using 'any' for file type to resolve "Cannot find namespace Express" error
  async uploadFile(@UploadedFile() file: any, @CurrentUser() user: User) {
    const url = await this.mediaService.uploadFile(file, user.id);
    return {
      success: true,
      url: url,
      mimetype: file.mimetype,
      size: file.size,
    };
  }
}
