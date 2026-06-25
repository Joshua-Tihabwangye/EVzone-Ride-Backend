import { Global, Module } from '@nestjs/common';
import { DomainEventsService } from './domain-events.service';
import { InfrastructureController } from './infrastructure.controller';
import { RedisService } from './redis.service';

@Global()
@Module({
  controllers: [InfrastructureController],
  providers: [RedisService, DomainEventsService],
  exports: [RedisService, DomainEventsService],
})
export class InfrastructureModule {}
