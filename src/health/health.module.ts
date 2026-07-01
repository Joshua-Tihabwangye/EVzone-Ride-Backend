import { Module } from '@nestjs/common';
import { WorkersConfigModule } from '../workers/workers-config.module';
import { HealthController } from './health.controller';

@Module({
  imports: [WorkersConfigModule],
  controllers: [HealthController],
})
export class HealthModule {}
