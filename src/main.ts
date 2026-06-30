import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { SwaggerModule } from '@nestjs/swagger';
import { NestExpressApplication } from '@nestjs/platform-express';
import compression from 'compression';
import helmet from 'helmet';
import { resolve } from 'node:path';
import { AppModule } from './app.module';
import { requestContextMiddleware } from './common/request-context';
import { buildSwaggerConfig, SWAGGER_SITE_TITLE, SWAGGER_UI_PATH } from './infrastructure/swagger-config';
import { enhanceSwaggerDocument } from './infrastructure/swagger-document-post-processor';
import { RedisIoAdapter } from './realtime/redis-io.adapter';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
  });

  app.use(requestContextMiddleware);
  app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: false }));
  app.use(compression());
  app.enableCors({
    origin:
      (process.env.CORS_ORIGINS ?? '*') === '*'
        ? true
        : (process.env.CORS_ORIGINS ?? '').split(',').map((item) => item.trim()),
    credentials: true,
  });
  app.useStaticAssets(resolve(process.env.STORAGE_PATH ?? './storage'), { prefix: '/uploads/' });
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  app.enableShutdownHooks();

  const socketAdapter = new RedisIoAdapter(app);
  if (await socketAdapter.connect()) app.useWebSocketAdapter(socketAdapter);

  const swaggerConfig = buildSwaggerConfig();
  let document = SwaggerModule.createDocument(app, swaggerConfig, {
    operationIdFactory: (controllerKey: string, methodKey: string) =>
      `${controllerKey.replace(/Controller$/, '')}_${methodKey}`,
    deepScanRoutes: true,
  });
  document = enhanceSwaggerDocument(document);
  SwaggerModule.setup(SWAGGER_UI_PATH, app, document, {
    customSiteTitle: SWAGGER_SITE_TITLE,
    swaggerOptions: { persistAuthorization: true, displayRequestDuration: true },
  });

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port, process.env.HOST ?? '0.0.0.0');

  console.log(`EVzone Ride API: http://localhost:${port}/api/v1`);

  console.log(`Swagger: http://localhost:${port}/docs`);
}

void bootstrap();
