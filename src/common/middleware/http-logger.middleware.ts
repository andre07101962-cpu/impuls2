import { Injectable, NestMiddleware, Logger } from '@nestjs/common';

@Injectable()
export class HttpLoggerMiddleware implements NestMiddleware {
  private logger = new Logger('HTTP');

  use(req: any, res: any, next: () => void) {
    const { method, originalUrl, body, query } = req;
    
    // Log Request
    this.logger.log(`📥 [${method}] ${originalUrl}`);
    if (body && Object.keys(body).length > 0) {
      // Pretty print body for better visibility in terminal
      console.log('   📦 Body:', JSON.stringify(body, null, 2));
    }
    if (query && Object.keys(query).length > 0) {
      console.log('   ❓ Query:', JSON.stringify(query, null, 2));
    }

    const start = Date.now();

    res.on('finish', () => {
      const duration = Date.now() - start;
      const { statusCode } = res;
      // Log Response Status
      this.logger.log(`📤 [${method}] ${originalUrl} -> ${statusCode} (${duration}ms)`);
    });

    next();
  }
}