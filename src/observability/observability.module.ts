import { Global, Module } from '@nestjs/common';
import { BusinessMetricsService } from './metrics/business-metrics.service';
import { MetricsInterceptor } from './metrics/metrics.interceptor';
import { MetricsServerService } from './metrics/metrics.server';
import { MetricsService } from './metrics/metrics.service';
import { TraceInterceptor } from './tracing/trace.interceptor';

@Global()
@Module({
  providers: [
    TraceInterceptor,
    MetricsService,
    BusinessMetricsService,
    MetricsServerService,
    MetricsInterceptor,
  ],
  exports: [
    TraceInterceptor,
    MetricsService,
    BusinessMetricsService,
    MetricsServerService,
    MetricsInterceptor,
  ],
})
export class ObservabilityModule {}
