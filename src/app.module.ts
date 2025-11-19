import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from './modules/auth/auth.module';
import { BotsModule } from './modules/bots/bots.module';
import { User } from './database/entities/user.entity';
import { UserBot } from './database/entities/user-bot.entity';
import { Channel } from './database/entities/channel.entity';
import { Post } from './database/entities/post.entity';
import { ScheduledPublication } from './database/entities/scheduled-publication.entity';
import { Campaign } from './database/entities/campaign.entity';
import { Participant } from './database/entities/participant.entity';
import { AdSlot } from './database/entities/ad-slot.entity';

@Module({
  imports: [
    // 1. Initialize Config Module first
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '.env.local'], // Look for both files
    }),
    // 2. Initialize TypeORM asynchronously to wait for Config
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        // Prefer DIRECT_URL (5432) for TypeORM synchronization/migrations
        const directUrl = configService.get<string>('DIRECT_URL');
        const poolerUrl = configService.get<string>('DATABASE_URL');
        
        const url = directUrl || poolerUrl;
        
        if (!url) {
          throw new Error('❌ FATAL: Database URL is missing! Check your .env or .env.local file.');
        }

        // Mask password for logging
        const safeUrl = url.replace(/:([^:@]+)@/, ':****@');
        console.log(`✅ Connecting to Database via: ${safeUrl}`);
        
        if (!directUrl) {
           console.warn('⚠️ WARNING: DIRECT_URL is missing. Using Pooler URL might fail for table creation.');
        }

        return {
          type: 'postgres',
          url: url,
          entities: [
            User, 
            UserBot,
            Channel,
            Post,
            ScheduledPublication,
            Campaign,
            Participant,
            AdSlot
          ],
          synchronize: false, // Disabled for stability with Supabase Pooler
          ssl: {
            rejectUnauthorized: false,
          },
          // CRITICAL: Settings for Transaction Pooler stability (Port 6543)
          extra: {
            max: 10,                  // Limit pool size
            connectionTimeoutMillis: 5000,
            idleTimeoutMillis: 30000,
            keepAlive: true,          // Prevent TCP drops
          },
        };
      },
    }),
    AuthModule,
    BotsModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}