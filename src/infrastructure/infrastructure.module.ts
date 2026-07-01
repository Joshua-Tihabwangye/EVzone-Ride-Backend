import { Global, Module } from '@nestjs/common';
import { DomainEventsService } from './domain-events.service';
import { InfrastructureController } from './infrastructure.controller';
import { ProcessRoleService } from './process-role.service';
import { ProductionConfigService } from './production-config.service';
import { RedisService } from './redis.service';
import { WorkerHeartbeatService } from './worker-heartbeat.service';

@Global()
@Module({
  controllers: [InfrastructureController],
  providers: [
    RedisService,
    DomainEventsService,
    ProcessRoleService,
    ProductionConfigService,
    WorkerHeartbeatService,
  ],
  exports: [
    RedisService,
    DomainEventsService,
    ProcessRoleService,
    ProductionConfigService,
    WorkerHeartbeatService,
  ],
})
export class InfrastructureModule {}
