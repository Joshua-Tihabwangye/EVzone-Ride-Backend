import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { HealthController } from './health.controller';
import { DatabaseHealthIndicator } from './indicators/database.health';
import { KafkaHealthIndicator } from './indicators/kafka.health';
import { MigrationsHealthIndicator } from './indicators/migrations.health';
import { RedisHealthIndicator } from './indicators/redis.health';
import { StorageHealthIndicator } from './indicators/storage.health';

@Module({
  imports: [TerminusModule],
  controllers: [HealthController],
  providers: [
    DatabaseHealthIndicator,
    MigrationsHealthIndicator,
    RedisHealthIndicator,
    KafkaHealthIndicator,
    StorageHealthIndicator,
  ],
})
export class HealthModule {}
