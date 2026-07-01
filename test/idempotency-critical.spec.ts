import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule, EventEmitter2 } from '@nestjs/event-emitter';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Controller, Post, Body, Get, HttpStatus, HttpCode } from '@nestjs/common';
import { DataSource } from 'typeorm';
import supertest from 'supertest';
import { PaymentMethod, PaymentStatus, WalletTransactionType } from '../src/common/enums';
import { ENTITIES, User } from '../src/database/entities';
import { IdempotencyModule } from '../src/idempotency/idempotency.module';
import { IdempotencyInterceptor } from '../src/idempotency/idempotency.interceptor';
import { RequireIdempotency } from '../src/idempotency/require-idempotency.decorator';
import { DatabaseModule } from '../src/database/database.module';
import { WalletsModule } from '../src/wallets/wallets.module';
import { PaymentsModule } from '../src/payments/payments.module';
import { FinancialOperationsModule } from '../src/financial-operations/financial-operations.module';
import { WalletsService } from '../src/wallets/wallets.service';
import { PaymentsService } from '../src/payments/payments.service';
import { FinancialOperationsService } from '../src/financial-operations/financial-operations.service';

class CounterService {
  private counter = 0;

  mutate(value: number) {
    this.counter += value;
    return { counter: this.counter };
  }

  read() {
    return { counter: this.counter };
  }

  reset() {
    this.counter = 0;
  }
}

@Controller('idempotency-test')
class IdempotencyTestController {
  constructor(private readonly counter: CounterService) {}

  @Post('mutate')
  @RequireIdempotency()
  @HttpCode(HttpStatus.OK)
  mutate(@Body() body: { value: number }) {
    return this.counter.mutate(body.value);
  }

  @Get('read')
  read() {
    return this.counter.read();
  }
}

describe('Idempotency critical flows', () => {
  let app: INestApplication;
  let dataSource: DataSource;

  beforeAll(async () => {
    const databaseUrl = process.env.DATABASE_URL ?? 'postgresql://evzone:evzone@localhost:5432/evzone';
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        EventEmitterModule.forRoot(),
        TypeOrmModule.forRoot({
          type: 'postgres',
          url: databaseUrl,
          entities: [...ENTITIES],
          synchronize: false,
          migrationsRun: true,
          logging: false,
        }),
        DatabaseModule,
        IdempotencyModule,
        WalletsModule,
        PaymentsModule,
        FinancialOperationsModule,
      ],
      controllers: [IdempotencyTestController],
      providers: [CounterService],
    })
      .overrideProvider(EventEmitter2)
      .useValue({ emit: jest.fn(), emitAsync: jest.fn(), removeAllListeners: jest.fn() })
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalInterceptors(app.get(IdempotencyInterceptor));
    await app.init();
    dataSource = moduleRef.get(DataSource);
  });

  afterAll(async () => {
    await app?.close();
  });

  beforeEach(async () => {
    app.get(CounterService).reset();
    await dataSource.query(`DELETE FROM idempotency_records`);
    await dataSource.query(`DELETE FROM earnings_ledger WHERE "userId" LIKE 'idemp-test-%'`);
    await dataSource.query(
      `DELETE FROM ledger_entries WHERE "journalId" IN (SELECT id::text FROM journal_transactions WHERE reference LIKE 'IDEMP-TEST-%')`,
    );
    await dataSource.query(`DELETE FROM ledger_accounts WHERE code LIKE 'WALLET:UGX:idemp-test-%'`);
    await dataSource.query(`DELETE FROM journal_transactions WHERE reference LIKE 'IDEMP-TEST-%'`);
    await dataSource.query(
      `DELETE FROM wallet_transactions WHERE reference LIKE 'IDEMP-TEST-%' OR reference LIKE 'TRF-%' OR reference LIKE 'PAYOUT-%' OR reference LIKE 'REF-%'`,
    );
    await dataSource.query(
      `DELETE FROM payouts WHERE reference LIKE 'PAYOUT-%' OR reference LIKE 'IDEMP-TEST-%'`,
    );
    await dataSource.query(`DELETE FROM cashout_requests WHERE "userId" LIKE 'idemp-test-%'`);
    await dataSource.query(`DELETE FROM payments WHERE "userId" LIKE 'idemp-test-%'`);
    await dataSource.query(`DELETE FROM wallets WHERE "userId" LIKE 'idemp-test-%'`);
    await dataSource.query(`DELETE FROM users WHERE email LIKE 'idemp-test-%@example.com'`);
  });

  describe('guard and interceptor', () => {
    it('rejects a mutating request without an Idempotency-Key header', async () => {
      const res = await supertest(app.getHttpServer())
        .post('/idempotency-test/mutate')
        .send({ value: 1 })
        .expect(HttpStatus.BAD_REQUEST);

      expect(res.body.message?.code ?? res.body.code).toBe('IDEMPOTENCY_KEY_REQUIRED');
    });

    it('rejects an empty Idempotency-Key header', async () => {
      const res = await supertest(app.getHttpServer())
        .post('/idempotency-test/mutate')
        .set('idempotency-key', '   ')
        .send({ value: 1 })
        .expect(HttpStatus.BAD_REQUEST);

      expect(res.body.message?.code ?? res.body.code).toBe('IDEMPOTENCY_KEY_REQUIRED');
    });

    it('rejects a key that is too short', async () => {
      const res = await supertest(app.getHttpServer())
        .post('/idempotency-test/mutate')
        .set('idempotency-key', 'short')
        .send({ value: 1 })
        .expect(HttpStatus.BAD_REQUEST);

      expect(res.body.message?.code ?? res.body.code).toBe('IDEMPOTENCY_KEY_INVALID');
    });

    it('replays a completed request when the same key is reused', async () => {
      const key = `idemp-replay-${randomUUID()}`;

      const first = await supertest(app.getHttpServer())
        .post('/idempotency-test/mutate')
        .set('idempotency-key', key)
        .send({ value: 5 })
        .expect(HttpStatus.OK);

      expect(first.body).toEqual({ counter: 5 });
      expect(first.headers['idempotency-key']).toBe(key);
      expect(first.headers['idempotency-replayed']).toBeUndefined();

      const second = await supertest(app.getHttpServer())
        .post('/idempotency-test/mutate')
        .set('idempotency-key', key)
        .send({ value: 5 })
        .expect(HttpStatus.OK);

      expect(second.body).toEqual({ counter: 5 });
      expect(second.headers['idempotency-replayed']).toBe('true');

      const state = await supertest(app.getHttpServer()).get('/idempotency-test/read').expect(HttpStatus.OK);
      expect(state.body).toEqual({ counter: 5 });
    });

    it('rejects the same key with a different request body', async () => {
      const key = `idemp-conflict-${randomUUID()}`;

      await supertest(app.getHttpServer())
        .post('/idempotency-test/mutate')
        .set('idempotency-key', key)
        .send({ value: 2 })
        .expect(HttpStatus.OK);

      const res = await supertest(app.getHttpServer())
        .post('/idempotency-test/mutate')
        .set('idempotency-key', key)
        .send({ value: 3 })
        .expect(HttpStatus.CONFLICT);

      expect(res.body.message).toBe('IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_REQUEST');
    });

    it('prevents a race where two concurrent calls with the same key execute twice', async () => {
      const key = `idemp-race-${randomUUID()}`;

      const [a, b] = await Promise.all([
        supertest(app.getHttpServer())
          .post('/idempotency-test/mutate')
          .set('idempotency-key', key)
          .send({ value: 1 }),
        supertest(app.getHttpServer())
          .post('/idempotency-test/mutate')
          .set('idempotency-key', key)
          .send({ value: 1 }),
      ]);

      const successes = [a, b].filter((r) => r.status === 200).length;
      const conflicts = [a, b].filter((r) => r.status === 409).length;
      expect(successes + conflicts).toBe(2);

      const state = await supertest(app.getHttpServer()).get('/idempotency-test/read').expect(HttpStatus.OK);
      expect(state.body).toEqual({ counter: 1 });
    });
  });

  describe('service-level idempotency', () => {
    let walletsService: WalletsService;
    let paymentsService: PaymentsService;
    let financialOpsService: FinancialOperationsService;

    beforeAll(() => {
      walletsService = app.get(WalletsService);
      paymentsService = app.get(PaymentsService);
      financialOpsService = app.get(FinancialOperationsService);
    });

    it('does not double-transfer when the same idempotency key is reused', async () => {
      const senderId = `idemp-test-transfer-sender-${randomUUID()}`;
      const recipientEmail = `idemp-test-${randomUUID()}@example.com`;
      const key = `transfer-${senderId}`;

      const usersRepo = dataSource.getRepository(User);
      const recipient = await usersRepo.save(
        usersRepo.create({
          email: recipientEmail,
          phone: `2567${Date.now()}`,
          firstName: 'Test',
          lastName: 'Recipient',
          passwordHash: 'hash',
        }),
      );

      await walletsService.credit(
        senderId,
        5_000,
        WalletTransactionType.TOP_UP,
        `IDEMP-TEST-CREDIT-${senderId}`,
      );

      const first = await walletsService.transfer(senderId, recipientEmail, 1_000, 'note', key);
      const second = await walletsService.transfer(senderId, recipientEmail, 1_000, 'note', key);

      expect(second.reference).toBe(first.reference);

      const senderWallet = await walletsService.get(senderId);
      const recipientWallet = await walletsService.get(recipient.id);
      expect(Number(senderWallet.availableBalance)).toBe(4_000);
      expect(Number(recipientWallet.availableBalance)).toBe(1_000);
    });

    it('does not double-withdraw when the same idempotency key is reused', async () => {
      const userId = `idemp-test-withdraw-${randomUUID()}`;
      const key = `withdraw-${userId}`;

      await walletsService.credit(userId, 5_000, WalletTransactionType.TOP_UP, `IDEMP-TEST-CREDIT-${userId}`);

      const first = await walletsService.withdraw(userId, 2_000, '256700000000', key);
      const second = await walletsService.withdraw(userId, 2_000, '256700000000', key);

      expect(second.id).toBe(first.id);

      const wallet = await walletsService.get(userId);
      expect(Number(wallet.availableBalance)).toBe(3_000);
    });

    it('does not double-refund when the same idempotency key is reused', async () => {
      const userId = `idemp-test-refund-${randomUUID()}`;
      const key = `refund-${userId}`;

      const payment = await paymentsService.createIntent(
        userId,
        {
          serviceType: 'SCHOOL_SHUTTLE' as any,
          serviceId: randomUUID(),
          method: PaymentMethod.CASH,
        },
        { ownerUserId: userId, amount: 2_000, currency: 'UGX', paymentStatus: PaymentStatus.PENDING },
      );
      await paymentsService.confirm(userId, payment.id);

      const first = await paymentsService.refund(userId, payment.id, 1_000, 'reason', key);
      const second = await paymentsService.refund(userId, payment.id, 1_000, 'reason', key);

      expect(second.id).toBe(first.id);
      expect(second.status).toBe(PaymentStatus.PARTIALLY_REFUNDED);
      expect(Number(second.refundedAmount)).toBe(1_000);

      const wallet = await walletsService.get(userId);
      expect(Number(wallet.availableBalance)).toBe(1_000);
    });

    it('does not double-review a cashout when the same idempotency key is reused', async () => {
      const userId = `idemp-test-cashout-${randomUUID()}`;
      const key = `cashout-review-${userId}`;

      await walletsService.credit(userId, 5_000, WalletTransactionType.TOP_UP, `IDEMP-TEST-CREDIT-${userId}`);

      const cashout = await financialOpsService.requestCashout(userId, {
        amount: 2_000,
        method: { phone: '256700000000' },
      });

      const first = await financialOpsService.reviewCashout(
        cashout.id,
        'admin-id',
        { status: 'APPROVED' },
        key,
      );
      const second = await financialOpsService.reviewCashout(
        cashout.id,
        'admin-id',
        { status: 'APPROVED' },
        key,
      );

      expect(second.id).toBe(first.id);
      expect(second.status).toBe('PAID');

      const wallet = await walletsService.get(userId);
      expect(Number(wallet.availableBalance)).toBe(3_000);
    });
  });
});
