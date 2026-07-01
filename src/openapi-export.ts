import { NestFactory } from '@nestjs/core';
import { SwaggerModule } from '@nestjs/swagger';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { AppModule } from './app.module';
import { buildSwaggerConfig, SWAGGER_UI_PATH, SWAGGER_SITE_TITLE } from './infrastructure/swagger-config';
import { enhanceSwaggerDocument } from './infrastructure/swagger-document-post-processor';

async function exportOpenApi(): Promise<void> {
  const outputPath = resolve(process.cwd(), process.env.OPENAPI_OUTPUT_PATH ?? 'docs/openapi.json');

  // Build the application context without starting the HTTP server or WebSocket adapters.
  // This still initialises the NestJS DI container and Swagger metadata so that the
  // generated document reflects the actual controllers and DTOs.
  const app = await NestFactory.create(AppModule, { logger: ['error'] });
  app.setGlobalPrefix('api/v1');

  const swaggerConfig = buildSwaggerConfig();
  let document = SwaggerModule.createDocument(app, swaggerConfig, {
    operationIdFactory: (controllerKey: string, methodKey: string) =>
      `${controllerKey.replace(/Controller$/, '')}_${methodKey}`,
    deepScanRoutes: true,
  });
  document = enhanceSwaggerDocument(document);

  // Configure Swagger UI options on the document so they are available to consumers.
  const documented = document as typeof document & Record<string, unknown>;
  documented['x-swagger-ui'] = {
    path: SWAGGER_UI_PATH,
    title: SWAGGER_SITE_TITLE,
    persistAuthorization: true,
    displayRequestDuration: true,
  };

  writeFileSync(outputPath, `${JSON.stringify(document, null, 2)}\n`, 'utf8');
  console.log(`OpenAPI spec exported to ${outputPath}`);

  await app.close();
}

void exportOpenApi().catch((error: unknown) => {
  console.error('OpenAPI export failed:', error instanceof Error ? error.message : String(error));
  process.exit(1);
});
