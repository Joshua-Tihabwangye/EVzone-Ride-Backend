import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { IdempotencyGuard } from './idempotency.guard';
import { IdempotencyInterceptor } from './idempotency.interceptor';
import { IdempotencyService } from './idempotency.service';

@Module({
  providers: [IdempotencyService, IdempotencyInterceptor, { provide: APP_GUARD, useClass: IdempotencyGuard }],
  exports: [IdempotencyService, IdempotencyInterceptor],
})
export class IdempotencyModule {}
