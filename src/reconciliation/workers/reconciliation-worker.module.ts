import { BullModule } from '@nestjs/bullmq';
import { DynamicModule, Module } from '@nestjs/common';
import { ReconciliationProcessor } from './reconciliation.processor';

@Module({})
export class ReconciliationWorkerModule {
  static register(): DynamicModule {
    const redisUrl = process.env.REDIS_URL?.trim();
    if (!redisUrl) {
      return { module: ReconciliationWorkerModule };
    }
    return {
      module: ReconciliationWorkerModule,
      imports: [
        BullModule.forRoot({ connection: { url: redisUrl } }),
        BullModule.registerQueue({ name: 'reconciliation' }),
      ],
      providers: [ReconciliationProcessor],
    };
  }
}
