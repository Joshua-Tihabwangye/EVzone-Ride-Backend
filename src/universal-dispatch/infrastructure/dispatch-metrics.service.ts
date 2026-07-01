import { Injectable, Optional } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

export interface GeoSourceCounters {
  REDIS: number;
  POSTGIS: number;
  HAVERSINE: number;
}

@Injectable()
export class DispatchMetricsService {
  private readonly counters: GeoSourceCounters = { REDIS: 0, POSTGIS: 0, HAVERSINE: 0 };

  constructor(@Optional() private readonly events?: EventEmitter2) {}

  incrementGeoSource(source: keyof GeoSourceCounters): void {
    this.counters[source] += 1;
    this.events?.emit('metrics.geo.source', { source, count: this.counters[source] });
  }

  getGeoSourceCounters(): GeoSourceCounters {
    return { ...this.counters };
  }

  reset(): void {
    this.counters.REDIS = 0;
    this.counters.POSTGIS = 0;
    this.counters.HAVERSINE = 0;
  }
}
