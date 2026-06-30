import { createHmac, createSign, generateKeyPairSync } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitter2, EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import supertest from 'supertest';
import { WebhookEventStatus } from '../src/common/enums';
import { signPayload } from '../src/common/utils/crypto-vault';
import { CorporatePayService } from '../src/corporate-pay/corporate-pay.service';
import { CorporatePayModule } from '../src/corporate-pay/corporate-pay.module';
import { DatabaseModule } from '../src/database/database.module';
import { createTypeOrmOptions } from '../src/database/typeorm-options';
import { FinancialOperationsModule } from '../src/financial-operations/financial-operations.module';
import { NotificationsModule } from '../src/notifications/notifications.module';
import { PaymentsModule } from '../src/payments/payments.module';
import { WalletsModule } from '../src/wallets/wallets.module';
import { WebhooksModule } from '../src/webhooks/webhooks.module';

describe('Webhook security', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let corporatePayService: CorporatePayService;
  let paytotaKeys: { privateKey: string; publicKey: string };
  const flutterwaveSecret = 'flutterwave-webhook-secret-32-bytes-long';
  const corporatePaySecret = 'corporatepay-webhook-secret-32-bytes';

  beforeAll(async () => {
    process.env.DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://evzone:evzone@localhost:5432/evzone';

    paytotaKeys = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });

    process.env.PAYTOTA_WEBHOOK_PUBLIC_KEY = paytotaKeys.publicKey;
    process.env.FLUTTERWAVE_WEBHOOK_SECRET = flutterwaveSecret;
    process.env.CORPORATEPAY_WEBHOOK_SECRET = corporatePaySecret;
    process.env.WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS = '300';

    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        EventEmitterModule.forRoot(),
        ScheduleModule.forRoot(),
        TypeOrmModule.forRoot(createTypeOrmOptions()),
        DatabaseModule,
        NotificationsModule,
        WalletsModule,
        FinancialOperationsModule,
        PaymentsModule,
        CorporatePayModule,
        WebhooksModule,
      ],
    })
      .overrideProvider(EventEmitter2)
      .useValue({ emit: jest.fn(), emitAsync: jest.fn(), removeAllListeners: jest.fn() })
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
    dataSource = moduleRef.get(DataSource);
    corporatePayService = moduleRef.get(CorporatePayService);
  });

  afterAll(async () => {
    await app?.close();
  });

  beforeEach(async () => {
    await dataSource.query(`DELETE FROM webhook_events`);
    await dataSource.query(`DELETE FROM corporate_pay_webhook_events`);
    await dataSource.query(`DELETE FROM corporate_pay_transactions WHERE reference LIKE 'WEBHOOK-TEST-%'`);
    await dataSource.query(`DELETE FROM payments WHERE reference LIKE 'WEBHOOK-TEST-%'`);
    await dataSource.query(`DELETE FROM users WHERE email LIKE 'webhook-test-%@example.com'`);
  });

  function signPaytota(rawBody: string): string {
    const signer = createSign('RSA-SHA256');
    signer.update(rawBody);
    return signer.sign(paytotaKeys.privateKey, 'base64');
  }

  function signFlutterwave(rawBody: string): string {
    return createHmac('sha256', flutterwaveSecret).update(rawBody).digest('hex');
  }

  function signCorporatePay(rawBody: string): string {
    return signPayload(rawBody, corporatePaySecret);
  }

  describe('Paytota', () => {
    it('accepts a webhook with a valid RSA signature and records it as failed when payment is missing', async () => {
      const payload = {
        id: 'evt-paytota-1',
        event_type: 'purchase.succeeded',
        status: 'succeeded',
        reference: 'WEBHOOK-TEST-REF-1',
      };
      const rawBody = JSON.stringify(payload);

      const res = await supertest(app.getHttpServer())
        .post('/webhooks/paytota')
        .set('x-signature', signPaytota(rawBody))
        .send(payload)
        .expect(404);

      expect(res.body.message).toContain('Payment referenced by webhook was not found');
      const record = await dataSource.query(
        `SELECT * FROM webhook_events WHERE "externalEventId" = 'evt-paytota-1'`,
      );
      expect(record[0].signatureValid).toBe(true);
      expect(record[0].status).toBe(WebhookEventStatus.FAILED);
      expect(record[0].provider).toBe('PAYTOTA');
    });

    it('rejects a webhook with an invalid RSA signature', async () => {
      const payload = { id: 'evt-paytota-2', event_type: 'purchase.succeeded', status: 'succeeded' };
      const rawBody = JSON.stringify(payload);

      const res = await supertest(app.getHttpServer())
        .post('/webhooks/paytota')
        .set('x-signature', 'invalid-signature')
        .send(payload)
        .expect(401);

      expect(res.body.message).toBe('WEBHOOK_SIGNATURE_INVALID');
      const record = await dataSource.query(
        `SELECT * FROM webhook_events WHERE "externalEventId" = 'evt-paytota-2'`,
      );
      expect(record[0].status).toBe(WebhookEventStatus.REJECTED);
      expect(record[0].signatureValid).toBe(false);
    });

    it('rejects a tampered Paytota payload', async () => {
      const payload = { id: 'evt-paytota-3', event_type: 'purchase.succeeded', status: 'succeeded' };
      const signature = signPaytota(JSON.stringify(payload));

      const tampered = { ...payload, status: 'failed' };
      const res = await supertest(app.getHttpServer())
        .post('/webhooks/paytota')
        .set('x-signature', signature)
        .send(tampered)
        .expect(401);

      expect(res.body.message).toBe('WEBHOOK_SIGNATURE_INVALID');
    });

    it('returns duplicate for a repeated event id', async () => {
      const payload = {
        id: 'evt-paytota-dup',
        event_type: 'purchase.succeeded',
        status: 'succeeded',
        reference: 'WEBHOOK-TEST-REF-DUP',
      };
      const rawBody = JSON.stringify(payload);

      await supertest(app.getHttpServer())
        .post('/webhooks/paytota')
        .set('x-signature', signPaytota(rawBody))
        .send(payload)
        .expect(404);

      const record = await dataSource.query(
        `SELECT id FROM webhook_events WHERE "externalEventId" = 'evt-paytota-dup'`,
      );

      const second = await supertest(app.getHttpServer())
        .post('/webhooks/paytota')
        .set('x-signature', signPaytota(rawBody))
        .send(payload)
        .expect(200);

      expect(second.body.duplicate).toBe(true);
      expect(second.body.eventId).toBe(record[0].id);
    });
  });

  describe('Flutterwave', () => {
    it('accepts a webhook with a valid HMAC signature and records it as failed when payment is missing', async () => {
      const payload = {
        event: 'charge.completed',
        data: { id: 'flw-1', tx_ref: 'WEBHOOK-TEST-REF-FLW', status: 'successful' },
      };
      const rawBody = JSON.stringify(payload);

      const res = await supertest(app.getHttpServer())
        .post('/webhooks/flutterwave')
        .set('verif-hash', signFlutterwave(rawBody))
        .send(payload)
        .expect(404);

      expect(res.body.message).toContain('Payment referenced by webhook was not found');
      const record = await dataSource.query(`SELECT * FROM webhook_events WHERE "externalEventId" = 'flw-1'`);
      expect(record[0].signatureValid).toBe(true);
      expect(record[0].provider).toBe('FLUTTERWAVE');
    });

    it('rejects a webhook with an invalid HMAC signature', async () => {
      const payload = { event: 'charge.completed', data: { id: 'flw-2', status: 'successful' } };

      const res = await supertest(app.getHttpServer())
        .post('/webhooks/flutterwave')
        .set('verif-hash', 'badhash')
        .send(payload)
        .expect(401);

      expect(res.body.message).toBe('WEBHOOK_SIGNATURE_INVALID');
      const record = await dataSource.query(`SELECT * FROM webhook_events WHERE "externalEventId" = 'flw-2'`);
      expect(record[0].status).toBe(WebhookEventStatus.REJECTED);
    });
  });

  describe('CorporatePay', () => {
    it('accepts a webhook with a valid HMAC signature and timestamp', async () => {
      const payload = {
        id: 'evt-cp-1',
        type: 'payment.paid',
        data: { reference: 'WEBHOOK-TEST-CP-1', transactionId: 'cp-tx-1' },
      };
      const rawBody = JSON.stringify(payload);

      await expect(
        corporatePayService.webhook(rawBody, signCorporatePay(rawBody), payload as any, {
          'x-corporatepay-timestamp': String(Math.floor(Date.now() / 1000)),
        }),
      ).rejects.toThrow('CorporatePay transaction referenced by webhook was not found');

      const record = await dataSource.query(
        `SELECT * FROM corporate_pay_webhook_events WHERE "externalEventId" = 'evt-cp-1'`,
      );
      expect(record[0].signatureValid).toBe(true);
      expect(record[0].status).toBe(WebhookEventStatus.FAILED);
    });

    it('rejects a webhook with an invalid HMAC signature', async () => {
      const payload = { id: 'evt-cp-2', type: 'payment.paid', data: {} };
      const rawBody = JSON.stringify(payload);

      await expect(
        corporatePayService.webhook(rawBody, 'bad-signature', payload as any, {
          'x-corporatepay-timestamp': String(Math.floor(Date.now() / 1000)),
        }),
      ).rejects.toThrow('Invalid CorporatePay webhook signature');

      const record = await dataSource.query(
        `SELECT * FROM corporate_pay_webhook_events WHERE "externalEventId" = 'evt-cp-2'`,
      );
      expect(record[0].signatureValid).toBe(false);
      expect(record[0].status).toBe(WebhookEventStatus.REJECTED);
    });

    it('rejects a webhook with an out-of-tolerance timestamp', async () => {
      const payload = { id: 'evt-cp-3', type: 'payment.paid', data: {} };
      const rawBody = JSON.stringify(payload);

      await expect(
        corporatePayService.webhook(rawBody, signCorporatePay(rawBody), payload as any, {
          'x-corporatepay-timestamp': String(Math.floor(Date.now() / 1000) - 400),
        }),
      ).rejects.toThrow('tolerance');

      const record = await dataSource.query(
        `SELECT * FROM corporate_pay_webhook_events WHERE "externalEventId" = 'evt-cp-3'`,
      );
      expect(record[0].status).toBe(WebhookEventStatus.REJECTED);
    });
  });
});
