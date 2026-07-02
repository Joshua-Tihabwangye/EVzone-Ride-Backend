import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, Repository } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import {
  ApprovalRequest,
  FeatureFlag,
  OperationalAlert,
  RiskCase,
  ServiceConfiguration,
} from '../database/entities';
import {
  CreateApprovalDto,
  CreateRiskCaseDto,
  DecideApprovalDto,
  UpdateRiskCaseDto,
  UpsertFeatureFlagDto,
  UpsertServiceConfigurationDto,
} from './governance.dto';

@Injectable()
export class GovernanceService {
  private readonly logger = new Logger(GovernanceService.name);

  constructor(
    @InjectRepository(FeatureFlag) private readonly flags: Repository<FeatureFlag>,
    @InjectRepository(ApprovalRequest) private readonly approvals: Repository<ApprovalRequest>,
    @InjectRepository(RiskCase) private readonly riskCases: Repository<RiskCase>,
    @InjectRepository(ServiceConfiguration)
    private readonly serviceConfigurations: Repository<ServiceConfiguration>,
    @InjectRepository(OperationalAlert) private readonly alerts: Repository<OperationalAlert>,
    private readonly auditService: AuditService,
  ) {}

  listFlags(scope?: string) {
    return this.flags.find({
      where: scope ? { scope } : undefined,
      order: { scope: 'ASC', key: 'ASC' },
    });
  }

  async evaluateFlag(key: string, scope = 'GLOBAL', context?: Record<string, unknown>) {
    const flag =
      (await this.flags.findOne({ where: { key, scope } })) ??
      (scope !== 'GLOBAL' ? await this.flags.findOne({ where: { key, scope: 'GLOBAL' } }) : null);
    if (!flag) return { key, scope, enabled: false, source: 'DEFAULT', context };
    return { key, scope: flag.scope, enabled: flag.enabled, rules: flag.rules, source: 'DATABASE', context };
  }

  async upsertFlag(userId: string, dto: UpsertFeatureFlagDto) {
    const scope = dto.scope?.trim() || 'GLOBAL';
    let flag = await this.flags.findOne({ where: { key: dto.key, scope } });
    flag ??= this.flags.create({ key: dto.key, scope });
    const before = flag.id ? { ...flag } : null;
    Object.assign(flag, {
      enabled: dto.enabled,
      description: dto.description,
      rules: dto.rules,
      updatedByUserId: userId,
    });
    const saved = await this.flags.save(flag);
    void this.auditService
      .record({
        actorUserId: userId,
        action: before ? 'FEATURE_FLAG_UPDATED' : 'FEATURE_FLAG_CREATED',
        entityType: 'FeatureFlag',
        entityId: `${saved.key}:${saved.scope}`,
        before: before ?? undefined,
        after: { ...saved },
      })
      .catch((error) =>
        this.logger.error(`Audit error: ${error instanceof Error ? error.message : String(error)}`),
      );
    return saved;
  }

  async createApproval(userId: string, dto: CreateApprovalDto) {
    const saved = await this.approvals.save(
      this.approvals.create({
        ...dto,
        requestedByUserId: userId,
        status: 'PENDING',
      }),
    );
    void this.auditService
      .record({
        actorUserId: userId,
        action: 'APPROVAL_CREATED',
        entityType: 'ApprovalRequest',
        entityId: saved.id,
        after: { ...saved },
      })
      .catch((error) =>
        this.logger.error(`Audit error: ${error instanceof Error ? error.message : String(error)}`),
      );
    return saved;
  }

  listApprovals(status?: string, entityType?: string) {
    const where: FindOptionsWhere<ApprovalRequest> = {};
    if (status) where.status = status;
    if (entityType) where.entityType = entityType;
    return this.approvals.find({ where, order: { createdAt: 'DESC' } });
  }

  async decideApproval(id: string, reviewerId: string, dto: DecideApprovalDto) {
    const approval = await this.approvals.findOne({ where: { id } });
    if (!approval) throw new NotFoundException('Approval request not found');
    if (approval.status !== 'PENDING') throw new ConflictException('Approval request already decided');
    const before = { ...approval };
    approval.status = dto.status;
    approval.notes = dto.notes ?? approval.notes;
    approval.reviewedByUserId = reviewerId;
    approval.reviewedAt = new Date();
    const saved = await this.approvals.save(approval);
    void this.auditService
      .record({
        actorUserId: reviewerId,
        action: 'APPROVAL_DECIDED',
        entityType: 'ApprovalRequest',
        entityId: saved.id,
        before,
        after: { ...saved },
        reason: dto.notes,
      })
      .catch((error) =>
        this.logger.error(`Audit error: ${error instanceof Error ? error.message : String(error)}`),
      );
    return saved;
  }

  async createRiskCase(dto: CreateRiskCaseDto) {
    const saved = await this.riskCases.save(
      this.riskCases.create({ ...dto, severity: dto.severity ?? 'MEDIUM', status: 'OPEN' }),
    );
    void this.auditService
      .record({
        action: 'RISK_CASE_CREATED',
        entityType: 'RiskCase',
        entityId: saved.id,
        after: { ...saved },
      })
      .catch((error) =>
        this.logger.error(`Audit error: ${error instanceof Error ? error.message : String(error)}`),
      );
    return saved;
  }

  listRiskCases(status?: string, severity?: string, subjectId?: string) {
    const where: FindOptionsWhere<RiskCase> = {};
    if (status) where.status = status;
    if (severity) where.severity = severity;
    if (subjectId) where.subjectId = subjectId;
    return this.riskCases.find({ where, order: { createdAt: 'DESC' } });
  }

  async updateRiskCase(id: string, userId: string, dto: UpdateRiskCaseDto) {
    const riskCase = await this.riskCases.findOne({ where: { id } });
    if (!riskCase) throw new NotFoundException('Risk case not found');
    const before = { ...riskCase };
    Object.assign(riskCase, dto);
    if (dto.status === 'RESOLVED' || dto.status === 'DISMISSED') {
      riskCase.resolvedAt = new Date();
      riskCase.resolvedByUserId = userId;
    }
    const saved = await this.riskCases.save(riskCase);
    void this.auditService
      .record({
        actorUserId: userId,
        action: 'RISK_CASE_UPDATED',
        entityType: 'RiskCase',
        entityId: saved.id,
        before,
        after: { ...saved },
      })
      .catch((error) =>
        this.logger.error(`Audit error: ${error instanceof Error ? error.message : String(error)}`),
      );
    return saved;
  }

  listServiceConfigurations() {
    return this.serviceConfigurations.find({ order: { key: 'ASC' } });
  }

  async upsertServiceConfiguration(userId: string, dto: UpsertServiceConfigurationDto) {
    let record = await this.serviceConfigurations.findOne({ where: { key: dto.key } });
    record ??= this.serviceConfigurations.create({ key: dto.key });
    const before = record.id ? { ...record } : null;
    Object.assign(record, dto, { updatedByUserId: userId });
    const saved = await this.serviceConfigurations.save(record);
    void this.auditService
      .record({
        actorUserId: userId,
        action: before ? 'SERVICE_CONFIGURATION_UPDATED' : 'SERVICE_CONFIGURATION_CREATED',
        entityType: 'ServiceConfiguration',
        entityId: saved.key,
        before: before ?? undefined,
        after: { ...saved },
      })
      .catch((error) =>
        this.logger.error(`Audit error: ${error instanceof Error ? error.message : String(error)}`),
      );
    return saved;
  }

  listAlerts(status?: string, severity?: string) {
    const where: FindOptionsWhere<OperationalAlert> = {};
    if (status) where.status = status;
    if (severity) where.severity = severity;
    return this.alerts.find({ where, order: { createdAt: 'DESC' }, take: 500 });
  }

  async acknowledgeAlert(id: string, userId: string) {
    const alert = await this.alerts.findOne({ where: { id } });
    if (!alert) throw new NotFoundException('Operational alert not found');
    const before = { ...alert };
    alert.status = alert.status === 'OPEN' ? 'ACKNOWLEDGED' : alert.status;
    alert.acknowledgedByUserId = userId;
    alert.acknowledgedAt = new Date();
    const saved = await this.alerts.save(alert);
    void this.auditService
      .record({
        actorUserId: userId,
        action: 'OPERATIONAL_ALERT_ACKNOWLEDGED',
        entityType: 'OperationalAlert',
        entityId: saved.id,
        before,
        after: { ...saved },
      })
      .catch((error) =>
        this.logger.error(`Audit error: ${error instanceof Error ? error.message : String(error)}`),
      );
    return saved;
  }

  async resolveAlert(id: string, userId: string, notes?: string) {
    const alert = await this.alerts.findOne({ where: { id } });
    if (!alert) throw new NotFoundException('Operational alert not found');
    const before = { ...alert };
    alert.status = 'RESOLVED';
    alert.resolvedAt = new Date();
    alert.acknowledgedByUserId ??= userId;
    alert.acknowledgedAt ??= new Date();
    alert.details = { ...(alert.details ?? {}), resolutionNotes: notes };
    const saved = await this.alerts.save(alert);
    void this.auditService
      .record({
        actorUserId: userId,
        action: 'OPERATIONAL_ALERT_RESOLVED',
        entityType: 'OperationalAlert',
        entityId: saved.id,
        before,
        after: { ...saved },
        reason: notes,
      })
      .catch((error) =>
        this.logger.error(`Audit error: ${error instanceof Error ? error.message : String(error)}`),
      );
    return saved;
  }
}
