import { DynamicModule, Module } from '@nestjs/common';
import { ReconciliationModule } from '../reconciliation.module';
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
      imports: [ReconciliationModule],
      providers: [ReconciliationProcessor],
    };
  }
}
