import { DynamicModule, Module } from '@nestjs/common';
import { ObservabilityModule } from '../../observability/observability.module';
import { ReconciliationModule } from '../reconciliation.module';
import { ReconciliationProcessor } from './reconciliation.processor';

@Module({})
export class ReconciliationWorkerModule {
  static register(): DynamicModule {
    const redisUrl = process.env.REDIS_URL?.trim();
    if (!redisUrl) {
      return { module: ReconciliationWorkerModule, imports: [ObservabilityModule] };
    }
    return {
      module: ReconciliationWorkerModule,
      imports: [ObservabilityModule, ReconciliationModule],
      providers: [ReconciliationProcessor],
    };
  }
}
