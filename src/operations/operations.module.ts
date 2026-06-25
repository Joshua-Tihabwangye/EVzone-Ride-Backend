import { Module } from '@nestjs/common';
import { OperationsController } from './operations.controller';
import { OperationsWatchdogService } from './operations-watchdog.service';

@Module({
  controllers: [OperationsController],
  providers: [OperationsWatchdogService],
  exports: [OperationsWatchdogService],
})
export class OperationsModule {}
