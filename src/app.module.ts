import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';

// Модули
import { AuthModule } from './modules/auth/auth.module';
import { BotsModule } from './modules/bots/bots.module';
import { ChannelsModule } from './modules/channels/channels.module';
import { PublisherModule } from './modules/publisher/publisher.module';

// Энтити (Таблицы)
import { User } from './database/entities/user.entity';
import { UserBot } from './database/entities/user-bot.entity';
import { Channel } from './database/entities/channel.entity';
import { Post } from './database/entities/post.entity';
import { ScheduledPublication } from './database/entities/scheduled-publication.entity';
import { Campaign } from './database/entities/campaign.entity';
import { Participant } from './database/entities/participant.entity';
import { AdSlot } from './database/entities/ad-slot.entity';
import { ForumTopic } from './database/entities/forum-topic.entity';

@Module({
  imports: [
    // 1. Конфигурация (.env)
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '.env.local'],
    }),

    // 🛡️ SECURITY: Rate Limiting (DDoS Protection)
    // 100 запросов в минуту (TTL: 60000ms) с одного IP
    ThrottlerModule.forRoot([{
      ttl: 60000,
      limit: 100,
    }]),

    // 2. База Данных (Optimized for Load)
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const directUrl = configService.get<string>('DIRECT_URL');
        const poolerUrl = configService.get<string>('DATABASE_URL');
        
        const url = poolerUrl || directUrl; // Prefer Pooler for High Load
        
        if (!url) {
          throw new Error('❌ FATAL: Database URL is missing! Check your .env file.');
        }

        return {
          type: 'postgres',
          url: url,
          entities: [
            User, UserBot, Channel, Post, 
            ScheduledPublication, Campaign, Participant, AdSlot,
            ForumTopic
          ],
          synchronize: false, 
          ssl: { rejectUnauthorized: false },
          extra: {
            // ⚠️ MEMORY OPTIMIZATION: Reduced pool for Free Tier (512MB RAM)
            // Was 50, changed to 5 to prevent OOM
            max: 5, 
            connectionTimeoutMillis: 10000,
            idleTimeoutMillis: 30000,
            keepAlive: true,
          },
        };
      },
    }),

    // 3. Очереди (Redis / BullMQ)
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const redisUrl = configService.get<string>('REDIS_URL');
        if (!redisUrl) console.warn('⚠️ WARNING: REDIS_URL is missing!');

        return {
          connection: {
            url: redisUrl,
            family: 0,
            // 🛡️ SECURITY: Fail fast if Redis is down, don't hang server
            connectTimeout: 10000, 
            maxRetriesPerRequest: null,
          },
        };
      },
    }),

    // 4. Бизнес-модули
    AuthModule,
    BotsModule,
    ChannelsModule,
    PublisherModule,
  ],
  providers: [
    // 🛡️ GLOBAL GUARD: Активируем защиту от спама для всех эндпоинтов
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
