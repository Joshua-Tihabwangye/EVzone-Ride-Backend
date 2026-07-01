import { EventEmitter2 } from '@nestjs/event-emitter';
import { DataSource, EntityManager } from 'typeorm';
import { PaymentMethod, PaymentStatus, ServiceType } from '../src/common/enums';
import { TransactionStore } from '../src/common/transaction';
import { Payment } from '../src/database/entities';
import { PaymentsService } from '../src/payments/payments.service';

function mockManager(repos: Record<string, unknown>): EntityManager {
  return {
    getRepository: (entity: unknown) => {
      const name = typeof entity === 'function' ? entity.name : String(entity);
      return (repos[name] ?? {
        findOne: jest.fn(),
        save: jest.fn(async (value: unknown) => value),
        create: jest.fn((value: unknown) => value),
        update: jest.fn(),
      }) as never;
    },
  } as unknown as EntityManager;
}

function mockDataSource(manager: EntityManager): DataSource {
  return {
    transaction: jest.fn(async (fn: (m: EntityManager) => Promise<unknown>) =>
      TransactionStore.run(manager, () => fn(manager)),
    ),
  } as unknown as DataSource;
}

describe('School Shuttle CorporatePay payment bridge', () => {
  it('creates and confirms a payment for an externally managed school trip', async () => {
    let stored: Record<string, any> | null = null;
    const payments = {
      findOne: jest.fn(async (options: { where?: Record<string, unknown> }) => {
        if (!stored || !options.where) return null;
        return Object.entries(options.where).every(([key, value]) => stored?.[key] === value) ? stored : null;
      }),
      create: jest.fn((value: Record<string, unknown>) => ({ ...value })),
      save: jest.fn(async (value: Record<string, unknown>) => {
        stored = { id: stored?.id ?? 'payment-school-1', ...stored, ...value };
        return stored;
      }),
    };
    const notifications = { create: jest.fn(async () => ({ id: 'notification-1' })) };
    const events = { emit: jest.fn() } as unknown as EventEmitter2;
    const manager = mockManager({ Payment: payments });
    const dataSource = mockDataSource(manager);
    const service = new PaymentsService(
      dataSource,
      payments as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { debit: jest.fn(), credit: jest.fn() } as never,
      notifications as never,
      events,
      {} as never,
      {} as never,
    );

    const created = await service.createIntent(
      'rider-1',
      {
        serviceType: ServiceType.SCHOOL_SHUTTLE,
        serviceId: 'school-trip-external-1',
        method: PaymentMethod.CORPORATE_PAY,
        idempotencyKey: 'school-payment-1',
      },
      {
        ownerUserId: 'rider-1',
        amount: 25_000,
        currency: 'UGX',
        paymentStatus: PaymentStatus.PENDING,
      },
    );

    expect(created).toMatchObject({
      userId: 'rider-1',
      serviceType: ServiceType.SCHOOL_SHUTTLE,
      serviceId: 'school-trip-external-1',
      amount: 25_000,
      currency: 'UGX',
      status: PaymentStatus.PENDING,
    });

    const confirmed = await service.confirm('rider-1', created.id, 'CORPORATEPAY-SCHOOL-OK');
    expect(confirmed.status).toBe(PaymentStatus.PAID);
    expect(notifications.create).toHaveBeenCalledTimes(1);
    expect(events.emit).toHaveBeenCalledWith(
      'service.updated',
      expect.objectContaining({ serviceType: ServiceType.SCHOOL_SHUTTLE }),
    );
  });
});
