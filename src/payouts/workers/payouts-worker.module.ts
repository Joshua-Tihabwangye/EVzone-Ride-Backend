import { DynamicModule, Module } from '@nestjs/common';
import { ObservabilityModule } from '../../observability/observability.module';
import { PayoutsModule } from '../payouts.module';
import { PayoutVerificationProcessor } from './payout-verification.processor';

@Module({})
export class PayoutsWorkerModule {
  static register(): DynamicModule {
    const redisUrl = process.env.REDIS_URL?.trim();
    if (!redisUrl) {
      return {
        module: PayoutsWorkerModule,
        imports: [ObservabilityModule],
      };
    }
    return {
      module: PayoutsWorkerModule,
      imports: [ObservabilityModule, PayoutsModule],
      providers: [PayoutVerificationProcessor],
    };
  }
}
