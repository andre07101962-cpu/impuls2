import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe, Logger } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

async function bootstrap() {
  const logger = new Logger('Bootstrap');

  (BigInt.prototype as any).toJSON = function () {
    return this.toString();
  };

  const app = await NestFactory.create(AppModule);

  // === СПИСОК РАЗРЕШЕННЫХ ДОМЕНОВ ===
  const WHITELIST = [
    'https://impyls.onrender.com',
    // 👇 ВСТАВИЛИ ТОТ ДОМЕН ИЗ ЛОГОВ (ваша Google среда):
    'https://0is2htrksq6y5vtpgsrm2z5yy02aw5vt4xjkppxibnh40wrcm6-h833788197.scf.usercontent.goog',
    'https://3vvomlh322bd67gde4qqggjqwy8qgmcg67cpeohmaqfownh0y1-h833788197.scf.usercontent.goog',
    // 👇 Добавьте сюда реальный домен фронтенда, когда он появится (например, Vercel)
  ];

  // ИЗМЕНЕНИЕ: Используем свою переменную IS_DEV, так как Render может перезаписывать NODE_ENV
  // Если в Environment Variables (на сайте) будет IS_DEV = true, включится режим разработки
  const isDevMode = process.env.IS_DEV === 'true'; 

  app.enableCors({
    origin: function (origin, callback) {
      if (!origin) return callback(null, true);

      if (isDevMode) {
        // === РЕЖИМ РАЗРАБОТКИ (ЛОГИРУЕМ ВСЕ) ===
        logger.log(`🔔 [CORS-DEV] Вход: ${origin}`);
        if (!WHITELIST.includes(origin)) {
          logger.warn(`⚠️ Добавь этот домен в WHITELIST для продакшена!`);
        }
        return callback(null, true); // Пускаем всех
      } else {
        // === БОЕВОЙ РЕЖИМ (ТОЛЬКО ПО СПИСКУ) ===
        if (WHITELIST.includes(origin)) {
          return callback(null, true);
        } else {
          logger.error(`⛔ [CORS-BLOCK] Блок: ${origin}`);
          return callback(new Error('Not allowed by CORS'));
        }
      }
    },
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
    allowedHeaders: 'Content-Type, Accept, Authorization',
  });

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));

  const config = new DocumentBuilder()
    .setTitle('Impulse API')
    .setVersion('1.0')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  const port = process.env.PORT || 3000;
  await app.listen(port);
  
  logger.log(`🚀 Режим: ${isDevMode ? 'DEVELOPMENT (Все разрешено)' : 'PRODUCTION (Строгий)'}`);
  logger.log(`🚀 URL: ${await app.getUrl()}`);
}
bootstrap();
