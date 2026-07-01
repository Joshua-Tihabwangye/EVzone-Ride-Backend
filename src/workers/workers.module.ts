import { BullModule } from '@nestjs/bullmq';
import { DynamicModule, Module } from '@nestjs/common';
import { WORKER_QUEUE_NAMES } from './bullmq-config.service';
import { WorkersConfigModule } from './workers-config.module';

@Module({})
export class WorkersModule {
  static register(): DynamicModule {
    const redisUrl = process.env.REDIS_URL?.trim();

    if (!redisUrl) {
      return {
        global: true,
        module: WorkersModule,
        imports: [WorkersConfigModule],
        exports: [WorkersConfigModule],
      };
    }

    const queues = WORKER_QUEUE_NAMES.map((name) => ({ name }));
    const deadLetterQueues = WORKER_QUEUE_NAMES.map((name) => ({
      name: `${name}-dead-letter`,
    }));

    return {
      global: true,
      module: WorkersModule,
      imports: [
        WorkersConfigModule,
        BullModule.forRoot({
          connection: { url: redisUrl },
        }),
        BullModule.registerQueue(...queues, ...deadLetterQueues),
      ],
      exports: [WorkersConfigModule, BullModule],
    };
  }
}
