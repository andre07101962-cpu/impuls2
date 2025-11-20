import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq'; // <--- ВАЖНО: Подключаем очереди

// Модули
import { AuthModule } from './modules/auth/auth.module';
import { BotsModule } from './modules/bots/bots.module';
import { ChannelsModule } from './modules/channels/channels.module'; // <--- Новый
import { PublisherModule } from './modules/publisher/publisher.module'; // <--- Новый

// Энтити (Таблицы)
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
    // 1. Конфигурация (.env)
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '.env.local'],
    }),

    // 2. База Данных (PostgreSQL / Supabase)
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const directUrl = configService.get<string>('DIRECT_URL');
        const poolerUrl = configService.get<string>('DATABASE_URL');
        
        const url = directUrl || poolerUrl;
        
        if (!url) {
          throw new Error('❌ FATAL: Database URL is missing! Check your .env file.');
        }

        const safeUrl = url.replace(/:([^:@]+)@/, ':****@');
        console.log(`✅ Connecting to Database via: ${safeUrl}`);

        return {
          type: 'postgres',
          url: url,
          entities: [
            User, UserBot, Channel, Post, 
            ScheduledPublication, Campaign, Participant, AdSlot
          ],
          synchronize: false, // В продакшене всегда false, используем миграции
          ssl: { rejectUnauthorized: false },
          extra: {
            max: 10,
            connectionTimeoutMillis: 5000,
            idleTimeoutMillis: 30000,
            keepAlive: true,
          },
        };
      },
    }),

    // 3. Очереди (Redis / BullMQ) - НОВОЕ
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const redisUrl = configService.get<string>('REDIS_URL');
        
        if (!redisUrl) {
           console.warn('⚠️ WARNING: REDIS_URL is missing! Scheduling will fail.');
        }

        return {
          connection: {
            url: redisUrl, // Например: rediss://default:password@...upstash.io:6379
            family: 0, // Исправляет некоторые ошибки DNS в Node v18+
          },
        };
      },
    }),

    // 4. Бизнес-модули
    AuthModule,
    BotsModule,
    ChannelsModule, // <--- Подключили
    PublisherModule, // <--- Подключили
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}