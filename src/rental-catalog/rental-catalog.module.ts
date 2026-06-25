import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { RentalCatalogController } from './rental-catalog.controller';
import { RentalCatalogService } from './rental-catalog.service';

@Module({
  imports: [NotificationsModule],
  controllers: [RentalCatalogController],
  providers: [RentalCatalogService],
  exports: [RentalCatalogService],
})
export class RentalCatalogModule {}
