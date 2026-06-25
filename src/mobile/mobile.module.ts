import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { MobileController } from './mobile.controller';
import { MobileService } from './mobile.service';

@Module({
  imports: [NotificationsModule],
  controllers: [MobileController],
  providers: [MobileService],
  exports: [MobileService],
})
export class MobileModule {}
