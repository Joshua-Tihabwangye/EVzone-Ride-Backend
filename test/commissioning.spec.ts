import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { AccountingModule } from '../src/accounting/accounting.module';
import { ServiceType } from '../src/common/enums';
import { CommissioningModule } from '../src/commissioning/commissioning.module';
import { CommissioningService } from '../src/commissioning/commissioning.service';
import { DatabaseModule } from '../src/database/database.module';
import { ENTITIES } from '../src/database/entities';
import { WalletsService } from '../src/wallets/wallets.service';

describe('Commissioning Engine', () => {
  let moduleRef: TestingModule;
  let service: CommissioningService;
  let wallets: WalletsService;
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
        CommissioningModule,
      ],
    }).compile();

    service = moduleRef.get(CommissioningService);
    wallets = moduleRef.get(WalletsService);
    dataSource = moduleRef.get(DataSource);
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  beforeEach(async () => {
    await dataSource.query('DELETE FROM commission_rules');
    await dataSource.query('DELETE FROM wallet_transactions');
    await dataSource.query('DELETE FROM wallets');
    await dataSource.query('DELETE FROM ledger_entries');
    await dataSource.query('DELETE FROM journal_transactions');
    await dataSource.query("DELETE FROM ledger_accounts WHERE code LIKE 'WALLET:%'");
    await dataSource.query("DELETE FROM ledger_accounts WHERE code LIKE 'REVENUE:%'");
  });

  it('should use the default 85/15 rule when no rule exists', async () => {
    const result = await service.computeCommission({
      serviceType: ServiceType.RIDE,
      amount: 10_000,
      currency: 'UGX',
    });
    expect(result.driverShare).toBe(8_500);
    expect(result.platformFee).toBe(1_500);
    expect(result.totalPlatformFee).toBe(1_500);
  });

  it('should select the highest priority matching rule', async () => {
    await service.createRule({
      name: 'Generic ride',
      serviceType: ServiceType.RIDE,
      currency: 'UGX',
      driverSharePercent: 80,
      platformFeePercent: 20,
      priority: 1,
      effectiveFrom: new Date('2000-01-01'),
    });
    await service.createRule({
      name: 'VIP ride',
      serviceType: ServiceType.RIDE,
      currency: 'UGX',
      marketId: 'kampala-vip',
      driverSharePercent: 90,
      platformFeePercent: 10,
      priority: 10,
      effectiveFrom: new Date('2000-01-01'),
    });

    const generic = await service.computeCommission({
      serviceType: ServiceType.RIDE,
      amount: 10_000,
      currency: 'UGX',
    });
    expect(generic.driverShare).toBe(8_000);

    const specific = await service.computeCommission({
      serviceType: ServiceType.RIDE,
      amount: 10_000,
      currency: 'UGX',
      marketId: 'kampala-vip',
    });
    expect(specific.driverShare).toBe(9_000);
  });

  it('should ignore rules outside their effective period', async () => {
    await service.createRule({
      name: 'Future rule',
      serviceType: ServiceType.RIDE,
      currency: 'UGX',
      driverSharePercent: 70,
      platformFeePercent: 30,
      priority: 100,
      effectiveFrom: new Date('2099-01-01'),
    });

    const result = await service.computeCommission({
      serviceType: ServiceType.RIDE,
      amount: 10_000,
      currency: 'UGX',
    });
    expect(result.driverShare).toBe(8_500);
  });

  it('should apply commission and post platform fee revenue', async () => {
    const result = await service.applyPaymentCommission({
      reference: 'PAY-COMM-1',
      serviceType: ServiceType.RIDE,
      serviceId: 'ride-1',
      amount: 10_000,
      currency: 'UGX',
      providerUserId: 'driver-1',
      payerUserId: 'rider-1',
    });

    expect(result.driverShare).toBe(8_500);
    expect(result.platformFee).toBe(1_500);

    const wallet = await wallets.get('driver-1');
    expect(Number(wallet.availableBalance)).toBe(8_500);

    const journal = await dataSource.query(
      `SELECT * FROM journal_transactions WHERE reference = 'PLATFORM-FEE-PAY-COMM-1'`,
    );
    expect(journal.length).toBe(1);
  });
});
