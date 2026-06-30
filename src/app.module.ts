import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { validationSchema, validationOptions } from './config/env.validation';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminModule } from './admin/admin.module';
import { AgentPortalModule } from './agent-portal/agent-portal.module';
import { AccountingModule } from './accounting/accounting.module';
import { AmbulanceModule } from './ambulance/ambulance.module';
import { AuthModule } from './auth/auth.module';
import { ChatModule } from './chat/chat.module';
import { CorporatePayModule } from './corporate-pay/corporate-pay.module';
import { CorporateIntegrationModule } from './corporate-integration/corporate-integration.module';
import { CommutesModule } from './commutes/commutes.module';
import { CompatibilityModule } from './compatibility/compatibility.module';
import { DispatchModule } from './dispatch/dispatch.module';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { AuditInterceptor } from './common/interceptors/audit.interceptor';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { DatabaseModule } from './database/database.module';
import { createTypeOrmOptions } from './database/typeorm-options';
import { DeliveriesModule } from './deliveries/deliveries.module';
import { DriversModule } from './drivers/drivers.module';
import { DriverJobsModule } from './driver-jobs/driver-jobs.module';
import { DriverExperienceModule } from './driver-experience/driver-experience.module';
import { FilesModule } from './files/files.module';
import { FleetPartnersModule } from './fleet-partners/fleet-partners.module';
import { FleetPortalModule } from './fleet-portal/fleet-portal.module';
import { FinancialOperationsModule } from './financial-operations/financial-operations.module';
import { HealthModule } from './health/health.module';
import { GeolocationModule } from './geolocation/geolocation.module';
import { GovernanceModule } from './governance/governance.module';
import { IdempotencyModule } from './idempotency/idempotency.module';
import { IdempotencyInterceptor } from './idempotency/idempotency.interceptor';
import { InfrastructureModule } from './infrastructure/infrastructure.module';
import { NotificationsModule } from './notifications/notifications.module';
import { MatchingModule } from './matching/matching.module';
import { MobileModule } from './mobile/mobile.module';
import { OrganizationsModule } from './organizations/organizations.module';
import { OnboardingModule } from './onboarding/onboarding.module';
import { OperationsModule } from './operations/operations.module';
import { PaymentsModule } from './payments/payments.module';
import { PlacesModule } from './places/places.module';
import { PricingModule } from './pricing/pricing.module';
import { RealtimeModule } from './realtime/realtime.module';
import { UniversalDispatchModule } from './universal-dispatch/universal-dispatch.module';
import { RentalCatalogModule } from './rental-catalog/rental-catalog.module';
import { RentalsModule } from './rentals/rentals.module';
import { RidesModule } from './rides/rides.module';
import { ReviewsModule } from './reviews/reviews.module';
import { SafetyModule } from './safety/safety.module';
import { TouristModule } from './tourist/tourist.module';
import { UsersModule } from './users/users.module';
import { VehiclesModule } from './vehicles/vehicles.module';
import { WalletsModule } from './wallets/wallets.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
      validationSchema,
      validationOptions,
    }),
    TypeOrmModule.forRootAsync({ useFactory: createTypeOrmOptions }),
    DatabaseModule,
    InfrastructureModule,
    OrganizationsModule,
    AccountingModule,
    OnboardingModule,
    OperationsModule,
    EventEmitterModule.forRoot({ wildcard: false, delimiter: '.' }),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([
      {
        ttl: Number(process.env.RATE_LIMIT_TTL_MS ?? 60_000),
        limit: Number(process.env.RATE_LIMIT_REQUESTS ?? 240),
      },
    ]),
    HealthModule,
    GeolocationModule,
    GovernanceModule,
    IdempotencyModule,
    AuthModule,
    UsersModule,
    NotificationsModule,
    MatchingModule,
    MobileModule,
    FilesModule,
    PricingModule,
    WalletsModule,
    PaymentsModule,
    CorporatePayModule,
    CorporateIntegrationModule,
    CommutesModule,
    CompatibilityModule,
    DriversModule,
    DriverExperienceModule,
    VehiclesModule,
    FleetPartnersModule,
    FleetPortalModule,
    FinancialOperationsModule,
    PlacesModule,
    RidesModule,
    DriverJobsModule,
    ReviewsModule,
    DeliveriesModule,
    TouristModule,
    AmbulanceModule,
    RentalsModule,
    RentalCatalogModule,
    ChatModule,
    SafetyModule,
    DispatchModule,
    UniversalDispatchModule,
    AgentPortalModule,
    AdminModule,
    RealtimeModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_INTERCEPTOR, useClass: ResponseInterceptor },
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
    { provide: APP_INTERCEPTOR, useClass: IdempotencyInterceptor },
  ],
})
export class AppModule {}
