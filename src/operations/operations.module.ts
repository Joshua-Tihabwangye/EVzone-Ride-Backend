import { Module } from '@nestjs/common';
import { ObservabilityModule } from '../observability/observability.module';
import { OperationsController } from './operations.controller';
import { OperationsWatchdogService } from './operations-watchdog.service';

@Module({
  imports: [ObservabilityModule],
  controllers: [OperationsController],
  providers: [OperationsWatchdogService],
  exports: [OperationsWatchdogService],
})
export class OperationsModule {}
