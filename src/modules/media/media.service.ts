
import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class MediaService {
  private readonly logger = new Logger(MediaService.name);
  private readonly supabaseUrl: string;
  private readonly supabaseKey: string;
  private readonly bucketName: string;

  constructor(private configService: ConfigService) {
    this.supabaseUrl = this.configService.get<string>('SUPABASE_URL');
    this.supabaseKey = this.configService.get<string>('SUPABASE_KEY');
    this.bucketName = this.configService.get<string>('SUPABASE_BUCKET') || 'impulse-media';

    if (!this.supabaseUrl || !this.supabaseKey) {
      this.logger.error('❌ Supabase configuration is missing! Check SUPABASE_URL and SUPABASE_KEY in .env');
    }
  }

  /**
   * Uploads file to Supabase Storage using REST API
   */
  async uploadFile(file: any, userId: string): Promise<string> {
    if (!file) throw new BadRequestException('No file provided');
    if (!this.supabaseUrl || !this.supabaseKey) {
      throw new BadRequestException('Storage service not configured');
    }

    // 1. Generate unique path: users/userId/uuid-filename.ext
    const fileExt = file.originalname?.split('.').pop() || 'bin';
    const fileName = `${uuidv4()}.${fileExt}`;
    const filePath = `users/${userId}/${fileName}`;

    try {
      // 2. Upload to Supabase Storage via REST API
      const uploadUrl = `${this.supabaseUrl}/storage/v1/object/${this.bucketName}/${filePath}`;
      
      this.logger.debug(`Uploading to: ${uploadUrl}`);

      const response = await axios.post(uploadUrl, file.buffer, {
        headers: {
          'Authorization': `Bearer ${this.supabaseKey}`,
          'Content-Type': file.mimetype,
          'x-upsert': 'true',
        },
      });

      // 3. Construct Public URL
      const publicUrl = `${this.supabaseUrl}/storage/v1/object/public/${this.bucketName}/${filePath}`;
      
      this.logger.log(`✅ File uploaded successfully: ${publicUrl}`);
      return publicUrl;
    } catch (error: any) {
      // 🔍 Специфичный лог ошибки от Supabase
      const errorDetail = error.response?.data?.message || error.response?.data?.error || error.message;
      const statusCode = error.response?.status;

      this.logger.error(`❌ Supabase Upload Failed [${statusCode}]: ${JSON.stringify(errorDetail)}`);
      
      if (statusCode === 400) {
        throw new BadRequestException(`Storage Error: ${errorDetail}. Possible cause: Bucket '${this.bucketName}' does not exist.`);
      }
      
      throw new BadRequestException(`Failed to upload file: ${errorDetail}`);
    }
  }
}
