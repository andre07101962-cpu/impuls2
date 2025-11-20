import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe, Logger } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

async function bootstrap() {
  const logger = new Logger('Bootstrap');

  // Fix BigInt for JSON
  (BigInt.prototype as any).toJSON = function () {
    return this.toString();
  };

  const app = await NestFactory.create(AppModule);

  // === СПИСОК ТОЧНЫХ ДОМЕНОВ (Exact Match) ===
  const WHITELIST = [
    'https://impyls.onrender.com',
    // Сюда потом добавишь реальный домен фронта (например, impyls.vercel.app)
  ];

  // === СПИСОК РАЗРЕШЕННЫХ ОКОНЧАНИЙ (Wildcard) ===
  // Разрешаем всё, что заканчивается на эти строки
  const ALLOWED_DOMAINS_SUFFIX = [
    '.scf.usercontent.goog', // Google IDX / Cloud Shell
    '.vercel.app',           // (Опционально) Разрешить все превью Vercel
  ];

  // Переменная для принудительного режима разработки
  // Установи IS_DEV = true в Render Environment, чтобы пускать вообще всех
  const isDevMode = process.env.IS_DEV === 'true';

  app.enableCors({
    origin: function (origin, callback) {
      // 1. Разрешаем запросы без origin (Postman, серверные вызовы)
      if (!origin) return callback(null, true);

      // 2. Если включен режим "ВСЕХ ПУСКАТЬ" (через переменную окружения)
      if (isDevMode) {
        logger.log(`🔔 [CORS-DEV] Вход: ${origin}`);
        return callback(null, true);
      }

      // 3. Проверка по Белому списку (точное совпадение)
      if (WHITELIST.includes(origin)) {
        return callback(null, true);
      }

      // 4. Проверка по окончанию домена (для динамических адресов Google)
      // Мы проверяем: заканчивается ли входящий адрес на '.scf.usercontent.goog'
      const isAllowedSuffix = ALLOWED_DOMAINS_SUFFIX.some(suffix => origin.endsWith(suffix));
      
      if (isAllowedSuffix) {
        logger.log(`✅ [CORS-DYNAMIC] Разрешен динамический домен: ${origin}`);
        return callback(null, true);
      }

      // 5. Если ничего не подошло — блокируем
      logger.error(`⛔ [CORS-BLOCK] Блок: ${origin}`);
      return callback(new Error('Not allowed by CORS'));
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
  
  logger.log(`🚀 Server running. Mode: ${isDevMode ? 'DEV (Open)' : 'PROD (Whitelisted)'}`);
}
bootstrap();