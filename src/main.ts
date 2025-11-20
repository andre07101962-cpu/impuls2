import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe, Logger } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  
  // PATCH: Fix BigInt serialization for JSON
  (BigInt.prototype as any).toJSON = function () {
    return this.toString();
  };

  const app = await NestFactory.create(AppModule);

  // === НАСТРОЙКИ ===
  // Список доменов, которым разрешен доступ в ПРОДАКШЕНЕ
  const WHITELIST = [
    'https://impyls.onrender.com', // Сам бэкенд (на всякий случай)
    'http://localhost:3000',       // Локальная разработка
    // Сюда ты добавишь домен своего фронта, когда увидишь его в логах
    // Например: 'https://my-frontend.vercel.app'
  ];

  // Проверка режима запуска (по умолчанию development, если не задано)
  const isProduction = process.env.NODE_ENV === 'production';

  // === CORS CONFIGURATION ===
  app.enableCors({
    origin: function (origin, callback) {
      // Разрешаем запросы без origin (например, из Postman или сервер-сервер)
      if (!origin) {
        return callback(null, true);
      }

      if (!isProduction) {
        // === РЕЖИМ РАЗРАБОТКИ (DEV) ===
        // Логируем, кто стучится
        logger.log(`🔔 [CORS-DEV] Входящий запрос от: ${origin}`);
        
        if (!WHITELIST.includes(origin)) {
          logger.warn(`⚠️ Этого домена НЕТ в белом списке!`);
          logger.warn(`👉 Чтобы это работало в продакшене, добавь '${origin}' в массив WHITELIST в main.ts`);
        } else {
          logger.log(`✅ Домен в белом списке.`);
        }

        // В режиме разработки разрешаем всем (true), чтобы не тормозить работу
        return callback(null, true);
      } else {
        // === БОЕВОЙ РЕЖИМ (PROD) ===
        if (WHITELIST.includes(origin)) {
          return callback(null, true);
        } else {
          logger.error(`⛔ [CORS-BLOCK] Заблокирована попытка входа с: ${origin}`);
          return callback(new Error('Not allowed by CORS'));
        }
      }
    },
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
    allowedHeaders: 'Content-Type, Accept, Authorization',
  });

  // Global Validation Pipe
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    transform: true,
    forbidNonWhitelisted: true,
  }));

  // Swagger Configuration
  const config = new DocumentBuilder()
    .setTitle('Impulse API')
    .setDescription('The Impulse Telegram SaaS Platform API documentation')
    .setVersion('1.0')
    .addTag('Auth')
    .addTag('Bots')
    .build();
    
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  // Start Server
  const port = process.env.PORT || 3000;
  await app.listen(port);
  
  logger.log(`🚀 Режим работы: ${isProduction ? 'PRODUCTION (Строгий)' : 'DEVELOPMENT (Логирование)'}`);
  logger.log(`🚀 Application is running on: ${await app.getUrl()}`);
}
bootstrap();
