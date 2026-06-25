import { Module } from '@nestjs/common';
import { AdminPortalController, AdminSelfController } from './admin-portal.controller';
import { AdminPortalService } from './admin-portal.service';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

@Module({
  controllers: [AdminController, AdminPortalController, AdminSelfController],
  providers: [AdminService, AdminPortalService],
  exports: [AdminPortalService],
})
export class AdminModule {}
