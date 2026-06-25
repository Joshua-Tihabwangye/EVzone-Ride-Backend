import { Module } from '@nestjs/common';
import { DriversModule } from '../drivers/drivers.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { DriverCertificatesController, DriverExperienceController } from './driver-experience.controller';
import { DriverExperienceService } from './driver-experience.service';

@Module({
  imports: [DriversModule, NotificationsModule],
  controllers: [DriverExperienceController, DriverCertificatesController],
  providers: [DriverExperienceService],
  exports: [DriverExperienceService],
})
export class DriverExperienceModule {}
