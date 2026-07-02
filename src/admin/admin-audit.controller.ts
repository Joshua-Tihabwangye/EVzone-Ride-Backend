import { Controller, Get, NotFoundException, Param, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/enums';
import { AuditService } from '../audit/audit.service';
import { AuditLog } from '../database/entities';

@ApiTags('Administration')
@ApiBearerAuth()
@Roles(UserRole.ADMIN)
@Controller('admin/audit-logs')
export class AdminAuditController {
  constructor(
    @InjectRepository(AuditLog) private readonly audits: Repository<AuditLog>,
    private readonly auditService: AuditService,
  ) {}

  @Get()
  async list(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('action') action?: string,
    @Query('entityType') entityType?: string,
    @Query('entityId') entityId?: string,
    @Query('actorUserId') actorUserId?: string,
  ) {
    const p = Math.max(Number(page ?? 1), 1);
    const l = Math.min(Math.max(Number(limit ?? 20), 1), 100);

    const builder = this.audits.createQueryBuilder('audit').orderBy('audit.createdAt', 'DESC');

    if (action) builder.andWhere('audit.action = :action', { action });
    if (entityType) builder.andWhere('audit.entityType = :entityType', { entityType });
    if (entityId) builder.andWhere('audit.entityId = :entityId', { entityId });
    if (actorUserId) builder.andWhere('audit.actorUserId = :actorUserId', { actorUserId });

    const [items, total] = await builder
      .skip((p - 1) * l)
      .take(l)
      .getManyAndCount();

    return {
      items,
      meta: { page: p, limit: l, total, pageCount: Math.ceil(total / l) },
    };
  }

  @Get(':id/verify')
  async verify(@Param('id') id: string) {
    const result = await this.auditService.verify(id);
    if (!result.audit) throw new NotFoundException('Audit log not found');
    return { valid: result.valid, audit: result.audit };
  }
}
