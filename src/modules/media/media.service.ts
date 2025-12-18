
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
      this.logger.error('❌ Supabase configuration is missing!');
    }
  }

  // 🛠️ FIX: Using 'any' for file type to resolve "Cannot find namespace Express" error
  async uploadFile(file: any, userId: string): Promise<string> {
    if (!file) throw new BadRequestException('No file provided');

    // 1. Generate unique path: users/userId/uuid-filename.ext
    const fileExt = file.originalname.split('.').pop();
    const fileName = `${uuidv4()}.${fileExt}`;
    const filePath = `users/${userId}/${fileName}`;

    try {
      // 2. Upload to Supabase Storage via REST API
      const uploadUrl = `${this.supabaseUrl}/storage/v1/object/${this.bucketName}/${filePath}`;
      
      await axios.post(uploadUrl, file.buffer, {
        headers: {
          'Authorization': `Bearer ${this.supabaseKey}`,
          'Content-Type': file.mimetype,
          'x-upsert': 'true',
        },
      });

      // 3. Construct Public URL
      // Ensure the bucket is set to "Public" in Supabase Dashboard
      const publicUrl = `${this.supabaseUrl}/storage/v1/object/public/${this.bucketName}/${filePath}`;
      
      this.logger.log(`✅ File uploaded: ${publicUrl}`);
      return publicUrl;
    } catch (error) {
      this.logger.error(`❌ Upload failed: ${error.message}`);
      throw new BadRequestException('Failed to upload file to storage');
    }
  }
}
