
import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

@Injectable()
export class HttpLoggerMiddleware implements NestMiddleware {
  private logger = new Logger('HTTP');

  use(req: Request, res: Response, next: NextFunction) {
    const { method, originalUrl, body, query } = req;
    
    // Log Request
    this.logger.log(`📥 [${method}] ${originalUrl}`);
    if (Object.keys(body).length > 0) {
      // Pretty print body for better visibility in terminal
      console.log('   📦 Body:', JSON.stringify(body, null, 2));
    }
    if (Object.keys(query).length > 0) {
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
