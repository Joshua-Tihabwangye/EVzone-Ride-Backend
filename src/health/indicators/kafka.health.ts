import { Injectable } from '@nestjs/common';
import { HealthCheckError, HealthIndicator, HealthIndicatorResult } from '@nestjs/terminus';
import { DomainEventsService } from '../../infrastructure/domain-events.service';

@Injectable()
export class KafkaHealthIndicator extends HealthIndicator {
  constructor(private readonly events: DomainEventsService) {
    super();
  }

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    const status = this.events.status();
    const isHealthy = !status.enabled || status.connected;
    const result = this.getStatus(key, isHealthy, status);
    if (!isHealthy) {
      throw new HealthCheckError('Kafka is enabled but unreachable', result);
    }
    return result;
  }
}
