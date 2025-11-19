import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

async function bootstrap() {
  // PATCH: Fix BigInt serialization for JSON
  (BigInt.prototype as any).toJSON = function () {
    return this.toString();
  };

  const app = await NestFactory.create(AppModule);

  // === CORS CONFIGURATION ===
  // Critical for dynamic frontend environments (StackBlitz, Localhost, Cloud IDEs)
  app.enableCors({
    origin: true, // Reflects the request origin, allowing any domain to connect
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true, // Allows sending Authorization headers and Cookies
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
  console.log(`🚀 Application is running on: ${await app.getUrl()}`);
  console.log(`📄 Swagger docs available at: ${await app.getUrl()}/api/docs`);
}
bootstrap();
