import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ObservabilityModule } from '../observability/observability.module';
import { AuditLog } from './audit-log.entity';
import { AuditService } from './audit.service';

@Module({
  imports: [TypeOrmModule.forFeature([AuditLog]), ObservabilityModule],
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
