import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express';
import * as express from 'express';
import * as path from 'path';
import * as fs from 'fs';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';

// Max body size for JSON requests (base64 images can be large)
const BODY_SIZE_LIMIT = '50mb';

async function bootstrap(): Promise<void> {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Increase body size limit for base64 image uploads (default is only 100kb)
  app.use(express.json({ limit: BODY_SIZE_LIMIT }));
  app.use(express.urlencoded({ limit: BODY_SIZE_LIMIT, extended: true }));

  // Enable CORS
  app.enableCors();

  // Global Pipes & Validation
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false,
    }),
  );

  // Global Filters & Interceptors
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new TransformInterceptor());

  // Serve root-level static files (HTML, JS, CSS) ONLY for paths that
  // explicitly match known files – never intercept /api/* routes.
  const rootDir = process.cwd();
  app.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
    // Let all /api/ requests through immediately – no static lookup
    if (req.path.startsWith('/api/')) {
      return next();
    }

    // Only serve files that actually exist in the root directory
    const urlPath = req.path === '/' ? '/index.html' : req.path;
    const filePath = path.join(rootDir, urlPath);

    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      return res.sendFile(filePath);
    }

    next();
  });

  const configService = app.get(ConfigService);
  const port = configService.get<number>('app.port', 8002);

  await app.listen(port);

  logger.log(`🚀 Enterprise NestJS Backend running on: http://localhost:${port}`);
  logger.log(`👉 Legacy Admin Entry: http://localhost:${port}/admin.html`);
}

bootstrap().catch((err) => {
  new Logger('Bootstrap').error(`Fatal bootstrap error: ${err}`);
  process.exit(1);
});
