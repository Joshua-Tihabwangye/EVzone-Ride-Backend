import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BullmqConfigService } from './bullmq-config.service';
import { DeadLetterService } from './dead-letter.service';
import { WorkerHealthService } from './health/worker-health.service';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [BullmqConfigService, WorkerHealthService, DeadLetterService],
  exports: [BullmqConfigService, WorkerHealthService, DeadLetterService],
})
export class WorkersConfigModule {}
