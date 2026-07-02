import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { Between, DataSource, Repository } from 'typeorm';
import {
  PaymentMethod,
  PaymentStatus,
  ServiceType,
  TransactionDirection,
  WalletTransactionType,
} from '../common/enums';
import { getRepository, Transactional } from '../common/transaction';
import {
  AmbulanceRequest,
  DeliveryOrder,
  DriverProfile,
  Payment,
  RentalBooking,
  Ride,
  TouristBooking,
  WalletTransaction,
} from '../database/entities';
import { NotificationsService } from '../notifications/notifications.service';
import { WalletsService } from '../wallets/wallets.service';
import { CommissioningService } from '../commissioning/commissioning.service';
import { CreatePaymentDto } from './payments.dto';
import { PaymentProviderFactory } from './providers/payment-provider.factory';

const rounded = (value: number) => Math.round(Number(value) * 100) / 100;

export interface ServicePaymentData {
  ownerUserId: string;
  providerUserId?: string;
  amount: number;
  currency: string;
  paymentStatus: PaymentStatus;
  organizationId?: string;
}

@Injectable()
export class PaymentsService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Payment) private readonly payments: Repository<Payment>,
    @InjectRepository(Ride) private readonly rides: Repository<Ride>,
    @InjectRepository(DeliveryOrder) private readonly deliveries: Repository<DeliveryOrder>,
    @InjectRepository(TouristBooking) private readonly tourist: Repository<TouristBooking>,
    @InjectRepository(AmbulanceRequest) private readonly ambulances: Repository<AmbulanceRequest>,
    @InjectRepository(RentalBooking) private readonly rentals: Repository<RentalBooking>,
    @InjectRepository(DriverProfile) private readonly drivers: Repository<DriverProfile>,
    private readonly wallets: WalletsService,
    private readonly notifications: NotificationsService,
    private readonly events: EventEmitter2,
    private readonly providerFactory: PaymentProviderFactory,
    private readonly commissioning: CommissioningService,
  ) {}

  @Transactional()
  async createIntent(userId: string, dto: CreatePaymentDto, serviceOverride?: ServicePaymentData) {
    const payments = getRepository(Payment);

    if (dto.idempotencyKey) {
      const existing = await payments.findOne({
        where: { userId, idempotencyKey: dto.idempotencyKey },
      });
      if (existing) return existing;
    }

    const service = serviceOverride ?? (await this.getServiceData(dto.serviceType, dto.serviceId));
    if (service.ownerUserId !== userId) throw new ForbiddenException('You cannot pay for this booking');
    if (service.paymentStatus === PaymentStatus.PAID)
      throw new BadRequestException('Booking is already paid');

    return payments.save(
      payments.create({
        userId,
        organizationId: service.organizationId,
        serviceType: dto.serviceType,
        serviceId: dto.serviceId,
        amount: service.amount,
        currency: service.currency,
        method: dto.method,
        provider:
          dto.method === PaymentMethod.CORPORATE_PAY
            ? 'CORPORATEPAY'
            : [PaymentMethod.CASH, PaymentMethod.EVZONE_WALLET, PaymentMethod.INSURANCE].includes(dto.method)
              ? 'EVZONE_LOCAL'
              : this.providerFactory.defaultProviderName(),
        status: PaymentStatus.PENDING,
        reference: `PAY-${randomUUID()}`,
        idempotencyKey: dto.idempotencyKey,
        breakdown: { serviceAmount: service.amount },
      }),
    );
  }

  @Transactional()
  async confirm(
    userId: string,
    paymentId: string,
    providerToken?: string,
    idempotencyKey?: string,
    skipProviderVerification = false,
  ) {
    const payments = getRepository(Payment);
    const payment = await payments.findOne({
      where: { id: paymentId, userId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!payment) throw new NotFoundException('Payment not found');
    if (payment.status === PaymentStatus.PAID) return payment;
    if (![PaymentStatus.PENDING, PaymentStatus.FAILED].includes(payment.status)) {
      throw new BadRequestException(`Cannot confirm payment in ${payment.status} status`);
    }

    if (payment.method === PaymentMethod.EVZONE_WALLET) {
      await this.wallets.debit(
        userId,
        payment.amount,
        WalletTransactionType.PAYMENT,
        payment.reference,
        `${payment.serviceType} payment`,
        { serviceId: payment.serviceId },
        payment.organizationId,
      );
    } else if (payment.method === PaymentMethod.CORPORATE_PAY) {
      const approved = providerToken?.startsWith('CORPORATEPAY-') || process.env.NODE_ENV !== 'production';
      if (!approved) {
        payment.status = PaymentStatus.FAILED;
        await payments.save(payment);
        throw new BadRequestException('CorporatePay did not approve this transaction');
      }
      payment.providerReference = providerToken ?? `CORPORATEPAY-LOCAL-${randomUUID()}`;
    } else if (![PaymentMethod.CASH, PaymentMethod.INSURANCE].includes(payment.method)) {
      if (skipProviderVerification) {
        payment.providerReference = providerToken ?? `WEBHOOK-${randomUUID()}`;
      } else {
        const verification = await this.providerFactory.get(payment.provider).verify({
          providerToken,
          expectedAmount: payment.amount,
          expectedCurrency: payment.currency,
          expectedReference: payment.reference,
        });
        payment.breakdown = {
          ...(payment.breakdown ?? {}),
          providerVerification: {
            provider: payment.provider,
            status: verification.status,
            reason: verification.reason,
            response: verification.response,
          },
        };
        if (!verification.approved) {
          payment.status = PaymentStatus.FAILED;
          await payments.save(payment);
          throw new BadRequestException(verification.reason ?? 'Payment provider rejected the transaction');
        }
        payment.providerReference = verification.providerReference ?? providerToken;
      }
    } else {
      payment.providerReference = providerToken ?? `LOCAL-${randomUUID()}`;
    }

    payment.status = PaymentStatus.PAID;
    payment.providerReference ??= `LOCAL-${randomUUID()}`;
    payment.paidAt = new Date();
    await payments.save(payment);
    await this.updateServicePaymentStatus(payment.serviceType, payment.serviceId, PaymentStatus.PAID);
    await this.creditProvider(payment);
    await this.notifications.create({
      userId,
      type: undefined,
      title: 'Payment successful',
      body: `${payment.currency} ${payment.amount.toLocaleString()} was paid successfully.`,
      data: { paymentId: payment.id, serviceType: payment.serviceType, serviceId: payment.serviceId },
    });

    this.events.emit('domain.event', {
      eventType: 'payment.paid',
      aggregateType: 'Payment',
      aggregateId: payment.id,
      eventKey: payment.reference,
      payload: {
        paymentId: payment.id,
        reference: payment.reference,
        userId: payment.userId,
        serviceType: payment.serviceType,
        serviceId: payment.serviceId,
        amount: payment.amount,
        currency: payment.currency,
      },
    });
    if (payment.serviceType !== ServiceType.SCHOOL_SHUTTLE) {
      this.events.emit('domain.event', {
        eventType: 'earnings.accrued',
        aggregateType: 'Payment',
        aggregateId: payment.id,
        eventKey: payment.reference,
        payload: {
          paymentId: payment.id,
          serviceType: payment.serviceType,
          serviceId: payment.serviceId,
          amount: payment.amount,
          currency: payment.currency,
        },
      });
    }
    this.events.emit('service.updated', {
      serviceType: payment.serviceType,
      serviceId: payment.serviceId,
      data: { paymentStatus: PaymentStatus.PAID, paymentId: payment.id },
    });
    return payment;
  }

  @Transactional()
  async refund(
    requesterId: string,
    paymentId: string,
    amount?: number,
    reason?: string,
    idempotencyKey?: string,
  ) {
    const payments = getRepository(Payment);
    const payment = await payments.findOne({
      where: { id: paymentId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!payment) throw new NotFoundException('Payment not found');
    if (payment.status !== PaymentStatus.PAID && payment.status !== PaymentStatus.PARTIALLY_REFUNDED) {
      throw new BadRequestException('Only paid or partially refunded transactions can be refunded');
    }

    const refundAmount = amount ?? payment.amount;
    if (refundAmount <= 0) throw new BadRequestException('Refund amount must be greater than zero');
    const alreadyRefunded = rounded(Number(payment.refundedAmount ?? 0));
    if (rounded(alreadyRefunded + refundAmount) > rounded(payment.amount)) {
      throw new BadRequestException('Refund exceeds remaining payment amount');
    }

    const refundReference = idempotencyKey
      ? `REF-${payment.reference}-${idempotencyKey.slice(0, 16)}`
      : `REF-${payment.reference}-${randomUUID().slice(0, 8)}`;

    if (idempotencyKey) {
      const existingRefund = await getRepository(WalletTransaction).findOne({
        where: { reference: refundReference },
      });
      if (existingRefund) return payment;
    }

    await this.wallets.credit(
      payment.userId,
      refundAmount,
      WalletTransactionType.REFUND,
      refundReference,
      reason ?? 'Payment refund',
      { paymentId: payment.id, approvedBy: requesterId, idempotencyKey },
      payment.organizationId,
    );

    payment.refundedAmount = rounded(alreadyRefunded + refundAmount);
    payment.status =
      payment.refundedAmount === rounded(payment.amount)
        ? PaymentStatus.REFUNDED
        : PaymentStatus.PARTIALLY_REFUNDED;
    payment.refundedAt = new Date();
    return payments.save(payment);
  }

  list(userId: string, page = 1, limit = 20) {
    return this.payments
      .findAndCount({
        where: { userId },
        order: { createdAt: 'DESC' },
        skip: (page - 1) * limit,
        take: limit,
      })
      .then(([items, total]) => ({
        items,
        meta: { page, limit, total, pageCount: Math.ceil(total / limit) },
      }));
  }

  private async creditProvider(payment: Payment): Promise<void> {
    if (payment.serviceType === ServiceType.SCHOOL_SHUTTLE) return;
    const service = await this.getServiceData(payment.serviceType, payment.serviceId);
    if (!service.providerUserId || service.providerUserId === payment.userId) return;
    await this.commissioning.applyPaymentCommission({
      reference: payment.reference,
      serviceType: payment.serviceType,
      serviceId: payment.serviceId,
      amount: Number(payment.amount),
      currency: payment.currency,
      providerUserId: service.providerUserId,
      payerUserId: payment.userId,
    });
  }

  private async providerUserId(driverId?: string): Promise<string | undefined> {
    if (!driverId) return undefined;
    return (await getRepository(DriverProfile).findOne({ where: { id: driverId } }))?.userId;
  }

  private async getServiceData(serviceType: ServiceType, serviceId: string): Promise<ServicePaymentData> {
    switch (serviceType) {
      case ServiceType.RIDE: {
        const item = await getRepository(Ride).findOne({ where: { id: serviceId } });
        if (!item) break;
        return {
          ownerUserId: item.riderId,
          providerUserId: await this.providerUserId(item.driverId),
          amount: item.finalFare ?? item.estimatedFare,
          currency: item.currency,
          paymentStatus: item.paymentStatus,
          organizationId: item.organizationId,
        };
      }
      case ServiceType.DELIVERY: {
        const item = await getRepository(DeliveryOrder).findOne({ where: { id: serviceId } });
        if (!item) break;
        return {
          ownerUserId: item.customerId,
          providerUserId: await this.providerUserId(item.driverId),
          amount: item.finalCost ?? item.estimatedCost,
          currency: item.currency,
          paymentStatus: item.paymentStatus,
          organizationId: item.organizationId,
        };
      }
      case ServiceType.TOURIST_VEHICLE: {
        const item = await getRepository(TouristBooking).findOne({ where: { id: serviceId } });
        if (!item) break;
        return {
          ownerUserId: item.customerId,
          providerUserId: item.operatorUserId ?? (await this.providerUserId(item.driverId)),
          amount: item.finalAmount ?? item.estimatedAmount,
          currency: item.currency,
          paymentStatus: item.paymentStatus,
          organizationId: item.organizationId,
        };
      }
      case ServiceType.AMBULANCE: {
        const item = await getRepository(AmbulanceRequest).findOne({ where: { id: serviceId } });
        if (!item) break;
        return {
          ownerUserId: item.requesterId,
          providerUserId: await this.providerUserId(item.driverId),
          amount: item.finalCost ?? item.estimatedCost,
          currency: 'UGX',
          paymentStatus: item.paymentStatus,
          organizationId: item.organizationId,
        };
      }
      case ServiceType.CAR_RENTAL: {
        const item = await getRepository(RentalBooking).findOne({ where: { id: serviceId } });
        if (!item) break;
        return {
          ownerUserId: item.renterId,
          providerUserId: item.ownerUserId,
          amount: item.finalAmount ?? item.estimatedAmount,
          currency: item.currency,
          paymentStatus: item.paymentStatus,
          organizationId: item.organizationId,
        };
      }
    }
    throw new NotFoundException('Service booking not found');
  }

  async getSettlementRecords(periodStart: Date, periodEnd: Date, provider?: string) {
    const where: Record<string, unknown> = {
      status: PaymentStatus.PAID,
      paidAt: Between(periodStart, periodEnd),
    };
    if (provider) where.provider = provider;
    return this.payments.find({
      where,
      order: { paidAt: 'DESC' },
      select: ['id', 'reference', 'providerReference', 'amount', 'currency', 'provider', 'paidAt'],
    });
  }

  private async updateServicePaymentStatus(
    serviceType: ServiceType,
    serviceId: string,
    status: PaymentStatus,
  ) {
    if (serviceType === ServiceType.SCHOOL_SHUTTLE) return;
    const map: Partial<Record<ServiceType, Repository<any>>> = {
      [ServiceType.RIDE]: getRepository(Ride),
      [ServiceType.DELIVERY]: getRepository(DeliveryOrder),
      [ServiceType.TOURIST_VEHICLE]: getRepository(TouristBooking),
      [ServiceType.AMBULANCE]: getRepository(AmbulanceRequest),
      [ServiceType.CAR_RENTAL]: getRepository(RentalBooking),
    };
    const repository = map[serviceType];
    if (!repository) throw new NotFoundException('Unsupported payment service type');
    await repository.update(serviceId, { paymentStatus: status });
  }
}
