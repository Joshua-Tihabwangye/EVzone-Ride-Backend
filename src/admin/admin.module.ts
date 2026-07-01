import { Module } from '@nestjs/common';
import { WebhooksModule } from '../webhooks/webhooks.module';
import { AdminPortalController, AdminSelfController } from './admin-portal.controller';
import { AdminPortalService } from './admin-portal.service';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

@Module({
  imports: [WebhooksModule],
  controllers: [AdminController, AdminPortalController, AdminSelfController],
  providers: [AdminService, AdminPortalService],
  exports: [AdminPortalService],
})
export class AdminModule {}
