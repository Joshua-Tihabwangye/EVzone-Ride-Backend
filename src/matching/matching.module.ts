import { Module } from '@nestjs/common';
import { DriversModule } from '../drivers/drivers.module';
import { HealthModule } from '../health/health.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { MatchingController } from './matching.controller';
import { MatchingService } from './matching.service';

@Module({
  imports: [DriversModule, NotificationsModule],
  controllers: [MatchingController],
  providers: [MatchingService],
  exports: [MatchingService],
})
export class MatchingModule {}
