import { Injectable } from '@nestjs/common';
import { HealthCheckError, HealthIndicator, HealthIndicatorResult } from '@nestjs/terminus';
import { RedisService } from '../../infrastructure/redis.service';

@Injectable()
export class RedisHealthIndicator extends HealthIndicator {
  constructor(private readonly redis: RedisService) {
    super();
  }

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    const status = this.redis.status();
    const isHealthy = !status.configured || status.connected;
    const result = this.getStatus(key, isHealthy, status);
    if (!isHealthy) {
      throw new HealthCheckError('Redis is configured but unreachable', result);
    }
    return result;
  }
}
