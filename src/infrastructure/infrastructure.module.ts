import { Global, Module } from '@nestjs/common';
import { DomainEventsService } from './domain-events.service';
import { InfrastructureController } from './infrastructure.controller';
import { ProcessRoleService } from './process-role.service';
import { ProductionConfigService } from './production-config.service';
import { RedisService } from './redis.service';

@Global()
@Module({
  controllers: [InfrastructureController],
  providers: [RedisService, DomainEventsService, ProcessRoleService, ProductionConfigService],
  exports: [RedisService, DomainEventsService, ProcessRoleService, ProductionConfigService],
})
export class InfrastructureModule {}
