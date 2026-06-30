import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { DataSource, Repository } from 'typeorm';
import { AccountingModule } from '../src/accounting/accounting.module';
import {
  PaymentMethod,
  PaymentStatus,
  ReconciliationRunStatus,
  ReconciliationStatus,
  ServiceType,
} from '../src/common/enums';
import { DatabaseModule } from '../src/database/database.module';
import { ENTITIES, Payment } from '../src/database/entities';
import { PayoutsModule } from '../src/payouts/payouts.module';
import { ReconciliationModule } from '../src/reconciliation/reconciliation.module';
import { ReconciliationService } from '../src/reconciliation/reconciliation.service';

describe('Reconciliation Engine', () => {
  let moduleRef: TestingModule;
  let service: ReconciliationService;
  let paymentsRepo: Repository<Payment>;
  let dataSource: DataSource;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        DatabaseModule,
        TypeOrmModule.forRoot({
          type: 'sqljs',
          entities: [...ENTITIES],
          synchronize: true,
          logging: false,
        }),
        AccountingModule,
        PayoutsModule,
        ReconciliationModule,
      ],
    }).compile();

    service = moduleRef.get(ReconciliationService);
    paymentsRepo = moduleRef.get('PaymentRepository');
    dataSource = moduleRef.get(DataSource);
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  beforeEach(async () => {
    await dataSource.query('DELETE FROM reconciliation_records');
    await dataSource.query('DELETE FROM reconciliation_runs');
    await dataSource.query('DELETE FROM payouts');
    await dataSource.query('DELETE FROM payments');
  });

  const period = () => {
    const start = new Date();
    start.setHours(start.getHours() - 1);
    const end = new Date();
    end.setHours(end.getHours() + 1);
    return { periodStart: start, periodEnd: end };
  };

  it('should match payment by provider reference and amount', async () => {
    await paymentsRepo.save(
      paymentsRepo.create({
        userId: 'recon-user',
        serviceType: ServiceType.RIDE,
        serviceId: 'svc-1',
        amount: 5000,
        currency: 'UGX',
        method: PaymentMethod.MOBILE_MONEY,
        provider: 'FLUTTERWAVE',
        status: PaymentStatus.PAID,
        reference: 'PAY-1',
        providerReference: 'FW-REF-1',
        paidAt: new Date(),
      }),
    );

    const run = await service.startRun({
      type: 'PAYMENTS',
      ...period(),
      fileContent: Buffer.from(
        'reference,amount,currency,settled_at\nFW-REF-1,5000,UGX,2026-06-30T10:00:00Z',
      ).toString('base64'),
      fileMimeType: 'text/csv',
      tolerance: 0.01,
    });

    expect(run.status).toBe(ReconciliationRunStatus.COMPLETED);
    const summary = run.summary as Record<string, number>;
    expect(summary.matched).toBe(1);
  });

  it('should flag variance when settlement amount differs', async () => {
    await paymentsRepo.save(
      paymentsRepo.create({
        userId: 'recon-user',
        serviceType: ServiceType.RIDE,
        serviceId: 'svc-2',
        amount: 5000,
        currency: 'UGX',
        method: PaymentMethod.MOBILE_MONEY,
        provider: 'FLUTTERWAVE',
        status: PaymentStatus.PAID,
        reference: 'PAY-2',
        providerReference: 'FW-REF-2',
        paidAt: new Date(),
      }),
    );

    const run = await service.startRun({
      type: 'PAYMENTS',
      ...period(),
      fileContent: Buffer.from('reference,amount,currency\nFW-REF-2,4800,UGX').toString('base64'),
      fileMimeType: 'text/csv',
      tolerance: 0.01,
    });

    const recs = await service.listRecords(run.id);
    const variance = recs.find((r) => r.providerReference === 'FW-REF-2');
    expect(variance).toBeDefined();
    expect(variance!.status).toBe(ReconciliationStatus.VARIANCE);
    expect(Number(variance!.variance)).toBe(-200);
  });

  it('should flag missing settlement record as open', async () => {
    await paymentsRepo.save(
      paymentsRepo.create({
        userId: 'recon-user',
        serviceType: ServiceType.RIDE,
        serviceId: 'svc-3',
        amount: 3000,
        currency: 'UGX',
        method: PaymentMethod.MOBILE_MONEY,
        provider: 'FLUTTERWAVE',
        status: PaymentStatus.PAID,
        reference: 'PAY-3',
        providerReference: 'FW-REF-3',
        paidAt: new Date(),
      }),
    );

    const run = await service.startRun({
      type: 'PAYMENTS',
      ...period(),
      fileContent: Buffer.from('reference,amount,currency\nFW-OTHER,3000,UGX').toString('base64'),
      fileMimeType: 'text/csv',
      tolerance: 0.01,
    });

    const recs = await service.listRecords(run.id);
    const missing = recs.find((r) => r.providerReference === 'FW-REF-3');
    expect(missing).toBeDefined();
    expect(missing!.status).toBe(ReconciliationStatus.OPEN);
    expect(Number(missing!.settledAmount)).toBe(0);
  });

  it('should flag missing internal record from settlement file', async () => {
    const run = await service.startRun({
      type: 'PAYMENTS',
      ...period(),
      fileContent: Buffer.from('reference,amount,currency\nFW-UNMATCHED,2500,UGX').toString('base64'),
      fileMimeType: 'text/csv',
      tolerance: 0.01,
    });

    const recs = await service.listRecords(run.id);
    const orphan = recs.find((r) => r.providerReference === 'FW-UNMATCHED');
    expect(orphan).toBeDefined();
    expect(orphan!.status).toBe(ReconciliationStatus.OPEN);
    expect(orphan!.internalRecordType).toBe('UNKNOWN');
  });

  it('should resolve a variance record', async () => {
    await paymentsRepo.save(
      paymentsRepo.create({
        userId: 'recon-user',
        serviceType: ServiceType.RIDE,
        serviceId: 'svc-4',
        amount: 5000,
        currency: 'UGX',
        method: PaymentMethod.MOBILE_MONEY,
        provider: 'FLUTTERWAVE',
        status: PaymentStatus.PAID,
        reference: 'PAY-4',
        providerReference: 'FW-REF-4',
        paidAt: new Date(),
      }),
    );

    const run = await service.startRun({
      type: 'PAYMENTS',
      ...period(),
      fileContent: Buffer.from('reference,amount,currency\nFW-REF-4,4900,UGX').toString('base64'),
      fileMimeType: 'text/csv',
      tolerance: 0.01,
    });

    const recs = await service.listRecords(run.id);
    const variance = recs[0];
    const resolved = await service.resolveRecord(
      variance.id,
      { status: ReconciliationStatus.RESOLVED, resolution: 'Accepted fee deduction' },
      'admin',
    );
    expect(resolved.status).toBe(ReconciliationStatus.RESOLVED);
    expect(resolved.resolution).toBe('Accepted fee deduction');
    expect(resolved.resolvedByUserId).toBe('admin');
  });
});
