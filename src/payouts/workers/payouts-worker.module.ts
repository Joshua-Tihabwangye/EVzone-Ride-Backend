import { BullModule } from '@nestjs/bullmq';
import { DynamicModule, Module } from '@nestjs/common';
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
      imports: [
        BullModule.forRoot({
          connection: { url: redisUrl },
        }),
        BullModule.registerQueue({ name: 'payout-verification' }),
      ],
      providers: [PayoutVerificationProcessor],
    };
  }
}
