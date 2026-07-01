import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { FinancialOperationsModule } from '../financial-operations/financial-operations.module';
import { ObservabilityModule } from '../observability/observability.module';
import { FleetPortalController } from './fleet-portal.controller';
import { FleetPortalService } from './fleet-portal.service';

@Module({
  imports: [FinancialOperationsModule, AuditModule, ObservabilityModule],
  controllers: [FleetPortalController],
  providers: [FleetPortalService],
  exports: [FleetPortalService],
})
export class FleetPortalModule {}
