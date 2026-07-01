import { DynamicModule, Module } from '@nestjs/common';
import { PayoutsModule } from '../payouts.module';
import { PayoutVerificationProcessor } from './payout-verification.processor';

@Module({})
export class PayoutsWorkerModule {
  static register(): DynamicModule {
    const redisUrl = process.env.REDIS_URL?.trim();
    if (!redisUrl) {
      return {
        module: PayoutsWorkerModule,
      };
    }
    return {
      module: PayoutsWorkerModule,
      imports: [PayoutsModule],
      providers: [PayoutVerificationProcessor],
    };
  }
}
