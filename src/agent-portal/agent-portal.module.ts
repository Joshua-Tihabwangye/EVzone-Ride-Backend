import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DispatchModule } from '../dispatch/dispatch.module';
import { AgentPortalAuthController } from './agent-portal-auth.controller';
import { AgentPortalCasesController } from './agent-portal-cases.controller';
import { AgentPortalOperationsController } from './agent-portal-operations.controller';
import { AgentPortalSettingsController } from './agent-portal-settings.controller';
import { AgentPortalWorkspaceController } from './agent-portal-workspace.controller';
import { AgentPortalService } from './agent-portal.service';

@Module({
  imports: [AuthModule, DispatchModule],
  controllers: [
    AgentPortalAuthController,
    AgentPortalWorkspaceController,
    AgentPortalOperationsController,
    AgentPortalCasesController,
    AgentPortalSettingsController,
  ],
  providers: [AgentPortalService],
  exports: [AgentPortalService],
})
export class AgentPortalModule {}
