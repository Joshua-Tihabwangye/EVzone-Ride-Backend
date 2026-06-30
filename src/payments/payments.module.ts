import { Module } from '@nestjs/common';
import { CommissioningModule } from '../commissioning/commissioning.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { WalletsModule } from '../wallets/wallets.module';
import { PaymentsController } from './payments.controller';
import { FlutterwavePaymentProvider } from './providers/flutterwave-payment.provider';
import { MockPaymentProvider } from './providers/mock-payment.provider';
import { PaymentProviderFactory } from './providers/payment-provider.factory';
import { PaymentsService } from './payments.service';

@Module({
  imports: [WalletsModule, NotificationsModule, CommissioningModule],
  controllers: [PaymentsController],
  providers: [PaymentsService, PaymentProviderFactory, MockPaymentProvider, FlutterwavePaymentProvider],
  exports: [PaymentsService, PaymentProviderFactory],
})
export class PaymentsModule {}
