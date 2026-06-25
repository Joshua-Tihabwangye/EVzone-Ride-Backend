import { Module } from '@nestjs/common';
import { OrganizationsModule } from '../organizations/organizations.module';
import { PaymentsModule } from '../payments/payments.module';
import { CorporatePayController } from './corporate-pay.controller';
import { CorporatePayService } from './corporate-pay.service';

@Module({
  imports: [OrganizationsModule, PaymentsModule],
  controllers: [CorporatePayController],
  providers: [CorporatePayService],
  exports: [CorporatePayService],
})
export class CorporatePayModule {}
