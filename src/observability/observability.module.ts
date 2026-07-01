import { Module } from '@nestjs/common';
import { TraceInterceptor } from './tracing/trace.interceptor';

@Module({
  providers: [TraceInterceptor],
  exports: [TraceInterceptor],
})
export class ObservabilityModule {}
