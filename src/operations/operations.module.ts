import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GovernanceModule } from '../governance/governance.module';
import { HealthModule } from '../health/health.module';
import { ObservabilityModule } from '../observability/observability.module';
import { WebhookEventRecord } from '../database/entities';
import { OperationsControlCenterController } from './operations-control-center.controller';
import { OperationsControlCenterService } from './operations-control-center.service';
import { OperationsController } from './operations.controller';
import { OperationsWatchdogService } from './operations-watchdog.service';
import { SloConfigService } from './slo-config.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([WebhookEventRecord]),
    ObservabilityModule,
    GovernanceModule,
    HealthModule,
  ],
  controllers: [OperationsController, OperationsControlCenterController],
  providers: [OperationsWatchdogService, SloConfigService, OperationsControlCenterService],
  exports: [OperationsWatchdogService, SloConfigService, OperationsControlCenterService],
})
export class OperationsModule {}
