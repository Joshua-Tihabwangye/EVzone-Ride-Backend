import { Module } from '@nestjs/common';
import { OrganizationsModule } from '../organizations/organizations.module';
import { FleetPartnersController } from './fleet-partners.controller';
import { FleetPartnersService } from './fleet-partners.service';

@Module({
  imports: [OrganizationsModule],
  controllers: [FleetPartnersController],
  providers: [FleetPartnersService],
  exports: [FleetPartnersService],
})
export class FleetPartnersModule {}
