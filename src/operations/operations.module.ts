import { Module } from '@nestjs/common';
import { ObservabilityModule } from '../observability/observability.module';
import { OperationsController } from './operations.controller';
import { OperationsWatchdogService } from './operations-watchdog.service';
import { SloConfigService } from './slo-config.service';

@Module({
  imports: [ObservabilityModule],
  controllers: [OperationsController],
  providers: [OperationsWatchdogService, SloConfigService],
  exports: [OperationsWatchdogService, SloConfigService],
})
export class OperationsModule {}
