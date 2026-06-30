import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PaymentMethod, PaymentStatus, WebhookEventStatus } from '../common/enums';
import { Payment, WebhookEventRecord } from '../database/entities';
import { PaymentsService } from '../payments/payments.service';

@Injectable()
export class WebhookEventProcessor {
  constructor(
    @InjectRepository(Payment) private readonly payments: Repository<Payment>,
    @InjectRepository(WebhookEventRecord) private readonly records: Repository<WebhookEventRecord>,
    private readonly paymentService: PaymentsService,
  ) {}

  async process(
    record: WebhookEventRecord,
  ): Promise<{ accepted: boolean; eventId: string; paymentId?: string }> {
    try {
      const normalized = record.provider.toUpperCase();
      const result =
        normalized === 'PAYTOTA'
          ? await this.processPaytota(record)
          : normalized === 'FLUTTERWAVE'
            ? await this.processFlutterwave(record)
            : null;

      if (!result) {
        throw new BadRequestException(`Unsupported webhook provider: ${record.provider}`);
      }

      record.status = WebhookEventStatus.PROCESSED;
      record.processedAt = new Date();
      record.relatedPaymentId = result.paymentId;
      await this.records.save(record);

      return { accepted: true, eventId: record.id, paymentId: result.paymentId };
    } catch (error) {
      record.status = WebhookEventStatus.FAILED;
      record.error = error instanceof Error ? error.message : String(error);
      record.attempts = (record.attempts ?? 0) + 1;
      record.nextAttemptAt = new Date(Date.now() + Math.min(record.attempts * 60_000, 3_600_000));
      await this.records.save(record);
      throw error;
    }
  }

  private async processPaytota(record: WebhookEventRecord): Promise<{ paymentId?: string }> {
    const payload = record.payload;
    const reference =
      typeof payload.reference === 'string'
        ? payload.reference
        : typeof payload.data === 'object' &&
            payload.data &&
            typeof (payload.data as Record<string, unknown>).reference === 'string'
          ? ((payload.data as Record<string, unknown>).reference as string)
          : undefined;
    const providerReference =
      (payload.id as string) ?? (payload.event_id as string) ?? record.externalEventId;
    const status = String(payload.status ?? '').toLowerCase();

    if (!reference) {
      throw new BadRequestException('Paytota webhook is missing a payment reference');
    }

    const payment = await this.payments.findOne({ where: { reference } });
    if (!payment) throw new NotFoundException('Payment referenced by webhook was not found');

    if (payment.status === PaymentStatus.PAID) return { paymentId: payment.id };

    if (['succeeded', 'successful', 'success', 'paid'].includes(status)) {
      await this.paymentService.confirm(payment.userId, payment.id, providerReference, undefined, true);
    } else if (['failed', 'declined', 'cancelled'].includes(status)) {
      payment.status = PaymentStatus.FAILED;
      await this.payments.save(payment);
    }

    return { paymentId: payment.id };
  }

  private async processFlutterwave(record: WebhookEventRecord): Promise<{ paymentId?: string }> {
    const payload = record.payload;
    const event = String(payload.event ?? '').toLowerCase();
    const data = (payload.data ?? {}) as Record<string, unknown>;
    const reference =
      typeof data.tx_ref === 'string'
        ? data.tx_ref
        : typeof data.reference === 'string'
          ? data.reference
          : undefined;
    const providerReference = (data.id as string) ?? record.externalEventId;

    if (!reference) {
      throw new BadRequestException('Flutterwave webhook is missing a payment reference');
    }

    const payment = await this.payments.findOne({ where: { reference } });
    if (!payment) throw new NotFoundException('Payment referenced by webhook was not found');

    if (payment.status === PaymentStatus.PAID) return { paymentId: payment.id };

    if (event.includes('charge.completed') || event.includes('payment.completed')) {
      const status = String(data.status ?? '').toLowerCase();
      if (['successful', 'success', 'completed'].includes(status)) {
        await this.paymentService.confirm(payment.userId, payment.id, providerReference, undefined, true);
      } else {
        payment.status = PaymentStatus.FAILED;
        await this.payments.save(payment);
      }
    }

    return { paymentId: payment.id };
  }
}
