import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, Repository } from 'typeorm';
import { CreateDispatchPolicyDto, ValidateDispatchPolicyDto } from '../universal-dispatch.dto';
import { DispatchPolicyStatus, UniversalServiceType } from '../domain/universal-dispatch.enums';
import { UniversalDispatchPolicy } from '../domain/universal-dispatch.entities';
import { DispatchPolicyConfig } from '../domain/universal-dispatch.types';
import { dispatchHash } from '../domain/universal-dispatch.utils';
import { DEFAULT_DISPATCH_POLICIES } from '../policies/default-dispatch-policies';

const SENSITIVE_RULE_TERMS = [
  'ethnicity',
  'religion',
  'race',
  'tribe',
  'caste',
  'culturalbackground',
  'politicalaffiliation',
  'sexualorientation',
];

const REQUIRED_NEVER_RELAX = [
  'driverVerification',
  'safety',
  'vehicleVerification',
  'documents',
  'insurance',
  'inspection',
  'capacity',
  'accessibility',
  'medical',
  'school',
  'energy',
];

@Injectable()
export class DispatchPolicyService implements OnModuleInit {
  constructor(
    @InjectRepository(UniversalDispatchPolicy)
    private readonly policies: Repository<UniversalDispatchPolicy>,
    private readonly dataSource: DataSource,
  ) {}

  async onModuleInit(): Promise<void> {
    if ((process.env.DISPATCH_SEED_DEFAULT_POLICIES ?? 'true').toLowerCase() !== 'true') return;
    for (const serviceType of Object.values(UniversalServiceType)) {
      await this.ensureDefault(serviceType);
    }
  }

  async ensureDefault(serviceType: UniversalServiceType): Promise<UniversalDispatchPolicy> {
    const version = '10.0.0-default';
    const policyKey = `default:${serviceType}`;
    const existing = await this.policies.findOne({ where: { policyKey, version } });
    if (existing) return existing;
    const config = DEFAULT_DISPATCH_POLICIES[serviceType];
    const errors = this.validateConfig(serviceType, config);
    if (errors.length) throw new BadRequestException({ code: 'INVALID_DEFAULT_POLICY', errors });
    try {
      return await this.policies.save(
        this.policies.create({
          policyKey,
          version,
          serviceType,
          status: DispatchPolicyStatus.ACTIVE,
          config: config as unknown as Record<string, unknown>,
          checksum: dispatchHash(config),
          validationErrors: [],
          effectiveFrom: new Date(),
          activatedAt: new Date(),
        }),
      );
    } catch (error) {
      const raced = await this.policies.findOne({ where: { policyKey, version } });
      if (raced) return raced;
      throw error;
    }
  }

  async resolve(
    serviceType: UniversalServiceType,
    marketId = 'default',
  ): Promise<{ policy: UniversalDispatchPolicy; config: DispatchPolicyConfig }> {
    const now = new Date();
    const candidate = await this.policies
      .createQueryBuilder('policy')
      .where('policy.serviceType = :serviceType', { serviceType })
      .andWhere('policy.status = :status', { status: DispatchPolicyStatus.ACTIVE })
      .andWhere('(policy.marketId = :marketId OR policy.marketId IS NULL)', { marketId })
      .andWhere('(policy.effectiveFrom IS NULL OR policy.effectiveFrom <= :now)', { now })
      .andWhere('(policy.effectiveUntil IS NULL OR policy.effectiveUntil > :now)', { now })
      .orderBy('CASE WHEN policy.marketId = :marketId THEN 0 ELSE 1 END', 'ASC')
      .addOrderBy('policy.activatedAt', 'DESC')
      .setParameter('marketId', marketId)
      .getOne();
    const policy = candidate ?? (await this.ensureDefault(serviceType));
    const config = policy.config as unknown as DispatchPolicyConfig;
    const errors = this.validateConfig(serviceType, config);
    if (errors.length) {
      throw new ConflictException({
        code: 'ACTIVE_DISPATCH_POLICY_INVALID',
        message: 'The active dispatch policy failed runtime validation.',
        policyId: policy.id,
        errors,
      });
    }
    return { policy, config };
  }

  async create(input: CreateDispatchPolicyDto, userId?: string): Promise<UniversalDispatchPolicy> {
    const errors = this.validateConfig(input.serviceType, input.config);
    const duplicate = await this.policies.findOne({
      where: { policyKey: input.policyKey, version: input.version },
    });
    if (duplicate) throw new ConflictException('Policy key and version already exist');
    return this.policies.save(
      this.policies.create({
        ...input,
        marketId: input.marketId,
        status: DispatchPolicyStatus.DRAFT,
        config: input.config as unknown as Record<string, unknown>,
        checksum: dispatchHash(input.config),
        validationErrors: errors,
        createdByUserId: userId,
        effectiveFrom: input.effectiveFrom ? new Date(input.effectiveFrom) : undefined,
        effectiveUntil: input.effectiveUntil ? new Date(input.effectiveUntil) : undefined,
      }),
    );
  }

  validate(input: ValidateDispatchPolicyDto): { valid: boolean; errors: string[]; checksum: string } {
    const errors = this.validateConfig(input.serviceType, input.config);
    return { valid: errors.length === 0, errors, checksum: dispatchHash(input.config) };
  }

  async activate(id: string, userId?: string): Promise<UniversalDispatchPolicy> {
    return this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(UniversalDispatchPolicy);
      const policy = await repository.findOne({ where: { id } });
      if (!policy) throw new NotFoundException('Dispatch policy not found');
      const errors = this.validateConfig(
        policy.serviceType,
        policy.config as unknown as DispatchPolicyConfig,
      );
      if (errors.length) throw new BadRequestException({ code: 'POLICY_VALIDATION_FAILED', errors });
      const active = await repository.find({
        where: {
          serviceType: policy.serviceType,
          status: DispatchPolicyStatus.ACTIVE,
          marketId: policy.marketId ?? IsNull(),
        },
      });
      const now = new Date();
      for (const current of active) {
        if (current.id === policy.id) continue;
        current.status = DispatchPolicyStatus.RETIRED;
        current.retiredAt = now;
        await repository.save(current);
      }
      policy.status = DispatchPolicyStatus.ACTIVE;
      policy.activatedAt = now;
      policy.retiredAt = undefined;
      policy.validationErrors = [];
      policy.checksum = dispatchHash(policy.config);
      policy.createdByUserId ??= userId;
      return repository.save(policy);
    });
  }

  async retire(id: string): Promise<UniversalDispatchPolicy> {
    const policy = await this.get(id);
    policy.status = DispatchPolicyStatus.RETIRED;
    policy.retiredAt = new Date();
    return this.policies.save(policy);
  }

  async get(id: string): Promise<UniversalDispatchPolicy> {
    const policy = await this.policies.findOne({ where: { id } });
    if (!policy) throw new NotFoundException('Dispatch policy not found');
    return policy;
  }

  async list(filters: {
    serviceType?: UniversalServiceType;
    status?: DispatchPolicyStatus;
    marketId?: string;
    page?: number;
    limit?: number;
  }) {
    const page = Math.max(1, filters.page ?? 1);
    const limit = Math.min(200, Math.max(1, filters.limit ?? 50));
    const where: Record<string, unknown> = {};
    if (filters.serviceType) where.serviceType = filters.serviceType;
    if (filters.status) where.status = filters.status;
    if (filters.marketId) where.marketId = filters.marketId;
    const [items, total] = await this.policies.findAndCount({
      where,
      order: { serviceType: 'ASC', activatedAt: 'DESC', createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { items, meta: { page, limit, total, pageCount: Math.ceil(total / limit) } };
  }

  capabilityManifest() {
    return {
      version: '10.0.0',
      architecture: 'UNIVERSAL_DISPATCH_UNIT',
      services: Object.values(UniversalServiceType),
      policySchemaVersion: '1.0',
      assignmentAuthority: 'POSTGRESQL_OR_TRANSACTIONALLY_EQUIVALENT_DATABASE',
      liveAcceleration: ['REDIS_GEO', 'REDIS_SNAPSHOTS'],
      discoveryFallbacks: ['POSTGIS', 'HAVERSINE'],
      guarantees: [
        'ELIGIBILITY_BEFORE_RANKING',
        'ONE_WINNING_ASSIGNMENT_PER_REQUEST',
        'ONE_CONFLICTING_ACTIVE_ASSIGNMENT_PER_DISPATCH_UNIT',
        'VERSIONED_POLICIES',
        'DECISION_TRACES',
        'TRANSACTIONAL_OUTBOX',
      ],
    };
  }

  validateConfig(serviceType: UniversalServiceType, raw: unknown): string[] {
    const errors: string[] = [];
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return ['config must be an object'];
    const config = raw as Partial<DispatchPolicyConfig>;
    const tokens = this.extractPolicyTokens(config);
    for (const term of SENSITIVE_RULE_TERMS) {
      if (tokens.includes(term)) errors.push(`Sensitive attribute is prohibited in policy: ${term}`);
    }
    if (!config.schemaVersion) errors.push('schemaVersion is required');
    if (!Array.isArray(config.allowedVehicleTypes) || config.allowedVehicleTypes.length === 0) {
      errors.push('allowedVehicleTypes must contain at least one vehicle type');
    }
    if (!Array.isArray(config.requiredCertifications)) errors.push('requiredCertifications must be an array');
    if (!Array.isArray(config.requiredCapabilities)) errors.push('requiredCapabilities must be an array');
    if (!Array.isArray(config.searchRadiiKm) || config.searchRadiiKm.length === 0) {
      errors.push('searchRadiiKm must contain at least one radius');
    } else {
      let previous = 0;
      for (const radius of config.searchRadiiKm) {
        if (!Number.isFinite(radius) || radius <= previous || radius > 500) {
          errors.push('searchRadiiKm must be strictly increasing positive values no greater than 500');
          break;
        }
        previous = radius;
      }
    }
    if (!this.validPositiveInteger(config.candidateLimit, 1, 1000)) {
      errors.push('candidateLimit must be between 1 and 1000');
    }
    if (!this.validPositiveInteger(config.routeMatrixLimit, 1, 100)) {
      errors.push('routeMatrixLimit must be between 1 and 100');
    }
    const weights = config.weights;
    if (!weights) errors.push('weights are required');
    else {
      const values = Object.values(weights);
      if (values.length !== 7 || values.some((value) => !Number.isFinite(value) || value < 0)) {
        errors.push('all seven ranking weights must be finite and non-negative');
      } else if (Math.abs(values.reduce((sum, value) => sum + value, 0) - 1) > 0.001) {
        errors.push('ranking weights must sum to 1');
      }
    }
    if (!Array.isArray(config.offerWaves) || config.offerWaves.length === 0) {
      errors.push('offerWaves must contain at least one wave');
    } else if (
      config.offerWaves.some(
        (wave) =>
          !this.validPositiveInteger(wave.size, 1, 50) ||
          !this.validPositiveInteger(wave.timeoutSeconds, 5, 600),
      )
    ) {
      errors.push('each offer wave must have size 1-50 and timeoutSeconds 5-600');
    }
    if (!this.validPositiveInteger(config.locationFreshnessSeconds, 5, 600)) {
      errors.push('locationFreshnessSeconds must be between 5 and 600');
    }
    if (!this.validPositiveInteger(config.maximumPickupEtaSeconds, 30, 86_400)) {
      errors.push('maximumPickupEtaSeconds must be between 30 and 86400');
    }
    if (!Array.isArray(config.neverRelax)) errors.push('neverRelax must be an array');
    else {
      for (const rule of REQUIRED_NEVER_RELAX) {
        if (!config.neverRelax.includes(rule)) errors.push(`neverRelax must include ${rule}`);
      }
    }
    if (serviceType === UniversalServiceType.SCHOOL_RIDE) {
      for (const value of ['authorizedRoster', 'childSafety']) {
        if (!config.neverRelax?.includes(value)) errors.push(`school policy must never relax ${value}`);
      }
    }
    if (
      [UniversalServiceType.MEDICAL_PWD_RIDE, UniversalServiceType.AMBULANCE_TRANSPORT].includes(
        serviceType,
      ) &&
      !config.neverRelax?.some(
        (value) => value.toLowerCase().includes('medical') || value.toLowerCase().includes('ambulance'),
      )
    ) {
      errors.push('medical/ambulance policy must contain a specialist never-relax rule');
    }
    return [...new Set(errors)];
  }

  private validPositiveInteger(value: unknown, minimum: number, maximum: number): boolean {
    return Number.isInteger(value) && Number(value) >= minimum && Number(value) <= maximum;
  }

  private extractPolicyTokens(raw: unknown): string[] {
    const tokens: string[] = [];
    const walk = (value: unknown) => {
      if (value && typeof value === 'object') {
        if (Array.isArray(value)) {
          value.forEach(walk);
        } else {
          Object.entries(value).forEach(([key, val]) => {
            tokens.push(...this.tokenizePolicyTerm(key));
            walk(val);
          });
        }
      } else if (typeof value === 'string') {
        tokens.push(...this.tokenizePolicyTerm(value));
      }
    };
    walk(raw);
    return [...new Set(tokens.map((t) => t.toLowerCase()))];
  }

  private tokenizePolicyTerm(text: string): string[] {
    return text
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      .replace(/[_-]+/g, ' ')
      .split(/\s+/)
      .filter(Boolean);
  }
}
