
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
    // 🛡️ SECURITY & STABILITY: Always trim keys to avoid "Invalid Compact JWS" due to spaces/quotes
    this.supabaseUrl = this.configService.get<string>('SUPABASE_URL')?.trim();
    this.supabaseKey = this.configService.get<string>('SUPABASE_KEY')?.trim();
    this.bucketName = this.configService.get<string>('SUPABASE_BUCKET') || 'impulse-media';

    this.validateConfig();
  }

  private validateConfig() {
    if (!this.supabaseUrl || !this.supabaseKey) {
      this.logger.error('❌ Supabase configuration is missing!');
      return;
    }

    // JWT check: A valid Supabase key consists of 3 parts separated by dots
    const parts = this.supabaseKey.split('.');
    if (parts.length !== 3) {
      this.logger.error('❌ SUPABASE_KEY is NOT a valid JWT! It should have 3 parts separated by dots.');
    } else {
      const maskedKey = `${this.supabaseKey.substring(0, 10)}...${this.supabaseKey.substring(this.supabaseKey.length - 10)}`;
      this.logger.log(`✅ Supabase Key detected (JWT format): ${maskedKey}`);
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

    const fileExt = file.originalname?.split('.').pop() || 'bin';
    const fileName = `${uuidv4()}.${fileExt}`;
    const filePath = `users/${userId}/${fileName}`;

    try {
      const uploadUrl = `${this.supabaseUrl}/storage/v1/object/${this.bucketName}/${filePath}`;
      
      this.logger.debug(`Uploading to: ${uploadUrl}`);

      // 🛠️ FIX: Supabase Storage API often requires BOTH Authorization and apikey headers
      const response = await axios.post(uploadUrl, file.buffer, {
        headers: {
          'Authorization': `Bearer ${this.supabaseKey}`,
          'apikey': this.supabaseKey, // <--- Mandatory for many Supabase setups
          'Content-Type': file.mimetype,
          'x-upsert': 'true',
        },
      });

      const publicUrl = `${this.supabaseUrl}/storage/v1/object/public/${this.bucketName}/${filePath}`;
      
      this.logger.log(`✅ File uploaded successfully: ${publicUrl}`);
      return publicUrl;
    } catch (error: any) {
      const errorDetail = error.response?.data?.message || error.response?.data?.error || error.message;
      const statusCode = error.response?.status;

      this.logger.error(`❌ Supabase Upload Failed [${statusCode}]: ${JSON.stringify(errorDetail)}`);
      
      if (errorDetail === 'Invalid Compact JWS') {
        throw new BadRequestException('Storage Auth Error: The provided SUPABASE_KEY is not a valid JWT. Check your .env file for extra spaces or incorrect values.');
      }
      
      throw new BadRequestException(`Failed to upload file: ${errorDetail}`);
    }
  }
}
