import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { WorkersConfigModule } from '../workers/workers-config.module';
import { HealthController } from './health.controller';
import { DependencyHealthMetricsService } from './dependency-health-metrics.service';
import { DatabaseHealthIndicator } from './indicators/database.health';
import { KafkaHealthIndicator } from './indicators/kafka.health';
import { MigrationsHealthIndicator } from './indicators/migrations.health';
import { RedisHealthIndicator } from './indicators/redis.health';
import { StorageHealthIndicator } from './indicators/storage.health';
import { WorkersHealthIndicator } from './indicators/workers.health';

@Module({
  imports: [TerminusModule, WorkersConfigModule],
  controllers: [HealthController],
  providers: [
    DatabaseHealthIndicator,
    MigrationsHealthIndicator,
    RedisHealthIndicator,
    KafkaHealthIndicator,
    StorageHealthIndicator,
    WorkersHealthIndicator,
    DependencyHealthMetricsService,
  ],
})
export class HealthModule {}
