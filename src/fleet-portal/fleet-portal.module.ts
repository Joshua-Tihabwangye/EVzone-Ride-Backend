import { Module } from '@nestjs/common';
import { FleetPortalController } from './fleet-portal.controller';
import { FleetPortalService } from './fleet-portal.service';

@Module({
  controllers: [FleetPortalController],
  providers: [FleetPortalService],
  exports: [FleetPortalService],
})
export class FleetPortalModule {}
