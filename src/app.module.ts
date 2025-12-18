
import { Module, MiddlewareConsumer, RequestMethod } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';

// Middleware
import { HttpLoggerMiddleware } from './common/middleware/http-logger.middleware';

// Модули
import { AuthModule } from './modules/auth/auth.module';
import { BotsModule } from './modules/bots/bots.module';
import { ChannelsModule } from './modules/channels/channels.module';
import { PublisherModule } from './modules/publisher/publisher.module';
import { MetaModule } from './modules/meta/meta.module';
import { MediaModule } from './modules/media/media.module';

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
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '.env.local'],
    }),
    ThrottlerModule.forRoot([{
      ttl: 60000,
      limit: 100,
    }]),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const url = configService.get<string>('DATABASE_URL') || configService.get<string>('DIRECT_URL');
        return {
          type: 'postgres',
          url: url,
          entities: [
            User, UserBot, Channel, Post, 
            ScheduledPublication, Campaign, Participant, AdSlot,
            ForumTopic
          ],
          synchronize: true, 
          ssl: { rejectUnauthorized: false },
          extra: {
            max: 5, 
            connectionTimeoutMillis: 10000,
          },
        };
      },
    }),
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        connection: {
          url: configService.get<string>('REDIS_URL'),
          family: 0,
        },
      }),
    }),
    AuthModule,
    BotsModule,
    ChannelsModule,
    PublisherModule,
    MetaModule,
    MediaModule, // <--- Добавлен
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(HttpLoggerMiddleware)
      .forRoutes({ path: '*', method: RequestMethod.ALL });
  }
}
