import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { WebhooksModule } from '../webhooks/webhooks.module';
import { AdminPortalController, AdminSelfController } from './admin-portal.controller';
import { AdminPortalService } from './admin-portal.service';
import { AdminAuditController } from './admin-audit.controller';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

@Module({
  imports: [WebhooksModule, AuditModule],
  controllers: [AdminController, AdminAuditController, AdminPortalController, AdminSelfController],
  providers: [AdminService, AdminPortalService],
  exports: [AdminPortalService],
})
export class AdminModule {}
