import { Injectable, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as prom from 'prom-client';

@Injectable()
export class MetricsService implements OnApplicationShutdown {
  constructor(private readonly config: ConfigService) {
    const collectDefaults = config.get<string>('METRICS_COLLECT_DEFAULTS')?.toLowerCase() === 'true';
    if (collectDefaults) {
      prom.register.setDefaultLabels({
        service: config.get<string>('OTEL_SERVICE_NAME') ?? 'evzone-ride',
      });
      prom.collectDefaultMetrics({ register: prom.register });
    }
  }

  getCounter<T extends string>(name: string, help: string, labelNames?: T[]): prom.Counter<T> {
    const existing = prom.register.getSingleMetric(name) as prom.Counter<T> | undefined;
    if (existing) return existing;
    return new prom.Counter<T>({
      name,
      help,
      ...(labelNames ? { labelNames } : {}),
    });
  }

  getHistogram<T extends string>(
    name: string,
    help: string,
    labelNames?: T[],
    buckets?: number[],
  ): prom.Histogram<T> {
    const existing = prom.register.getSingleMetric(name) as prom.Histogram<T> | undefined;
    if (existing) return existing;
    return new prom.Histogram<T>({
      name,
      help,
      ...(labelNames ? { labelNames } : {}),
      ...(buckets ? { buckets } : {}),
    });
  }

  getGauge<T extends string>(name: string, help: string, labelNames?: T[]): prom.Gauge<T> {
    const existing = prom.register.getSingleMetric(name) as prom.Gauge<T> | undefined;
    if (existing) return existing;
    return new prom.Gauge<T>({
      name,
      help,
      ...(labelNames ? { labelNames } : {}),
    });
  }

  async metrics(): Promise<string> {
    return prom.register.metrics();
  }

  onApplicationShutdown(): void {
    prom.register.clear();
  }
}
