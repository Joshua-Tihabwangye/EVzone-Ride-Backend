import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { NestExpressApplication } from '@nestjs/platform-express';
import compression from 'compression';
import helmet from 'helmet';
import { resolve } from 'node:path';
import { AppModule } from './app.module';
import { BRAND } from './common/constants';
import { requestContextMiddleware } from './common/request-context';
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

  const swaggerConfig = new DocumentBuilder()
    .setTitle('EVzone Ride – Rides & Logistics API')
    .setDescription(
      'Unified EVzone Ride and Logistics backend for ride-hailing, deliveries, tourist vehicles, ambulances, car rental, Fleet Partner, Agent/Dispatcher, Admin, school-fleet synchronization and CorporatePay integration. Version 10 adds the universal dispatch-unit domain, policy engine, auditable decision data, concurrency-safe assignment models and transactional dispatch outbox foundations.',
    )
    .setVersion('10.0.0')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' })
    .addServer('/api/v1', 'Version 1')
    .addTag('Authentication')
    .addTag('Ride Hailing')
    .addTag('Deliveries')
    .addTag('Tourist Vehicles')
    .addTag('Ambulance')
    .addTag('Car Rental')
    .addTag('Organizations')
    .addTag('Fleet Partner')
    .addTag('Fleet Partner Portal')
    .addTag('Agent & Dispatcher')
    .addTag('Agent Portal v7')
    .addTag('Admin Portal v8')
    .addTag('CorporatePay Partner API v9')
    .addTag('CorporatePay Integration')
    .addTag('CorporatePay Partner API v9')
    .addTag('Administration')
    .addTag('Infrastructure')
    .addTag('Matching & Job Offers')
    .addTag('Universal Dispatch v10')
    .addTag('Mobile App Contracts')
    .addTag('Driver Jobs')
    .addTag('Rider Places')
    .addTag('Reviews & Ratings')
    .addTag('Driver Preferences & Learning')
    .addTag('Accounting & Double-Entry Ledger')
    .addTag('Delivery Routes')
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document, {
    customSiteTitle: `${BRAND.name} API Documentation`,
    swaggerOptions: { persistAuthorization: true, displayRequestDuration: true },
  });

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port, process.env.HOST ?? '0.0.0.0');

  console.log(`EVzone Ride API: http://localhost:${port}/api/v1`);

  console.log(`Swagger: http://localhost:${port}/docs`);
}

void bootstrap();
