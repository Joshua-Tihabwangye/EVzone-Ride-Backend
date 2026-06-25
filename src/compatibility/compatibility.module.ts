import { Module } from '@nestjs/common';
import { AdminModule } from '../admin/admin.module';
import { AuthModule } from '../auth/auth.module';
import { DriversModule } from '../drivers/drivers.module';
import { FinancialOperationsModule } from '../financial-operations/financial-operations.module';
import { GovernanceModule } from '../governance/governance.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PaymentsModule } from '../payments/payments.module';
import { RidesModule } from '../rides/rides.module';
import { SafetyModule } from '../safety/safety.module';
import { UsersModule } from '../users/users.module';
import { VehiclesModule } from '../vehicles/vehicles.module';
import { WalletsModule } from '../wallets/wallets.module';
import { AdminCompatibilityController } from './admin-compat.controller';
import { CompatibilityDeprecationInterceptor } from './compatibility-deprecation.interceptor';
import { CompatibilityContractsController } from './contracts.controller';
import { CompatibilityService } from './compatibility.service';
import { DriverCompatibilityController } from './driver-compat.controller';
import { DriverJobsModule } from '../driver-jobs/driver-jobs.module';
import { RiderCompatibilityController } from './rider-compat.controller';

@Module({
  imports: [
    AdminModule,
    AuthModule,
    UsersModule,
    RidesModule,
    DriversModule,
    DriverJobsModule,
    VehiclesModule,
    WalletsModule,
    NotificationsModule,
    PaymentsModule,
    FinancialOperationsModule,
    SafetyModule,
    GovernanceModule,
  ],
  controllers: [
    CompatibilityContractsController,
    RiderCompatibilityController,
    DriverCompatibilityController,
    AdminCompatibilityController,
  ],
  providers: [CompatibilityService, CompatibilityDeprecationInterceptor],
  exports: [CompatibilityService],
})
export class CompatibilityModule {}
