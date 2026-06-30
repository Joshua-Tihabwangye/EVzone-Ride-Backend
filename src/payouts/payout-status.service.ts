import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import { PayoutStatus } from '../common/enums';
import { Payout } from '../database/entities';
import { PayoutOrchestratorService } from './payout-orchestrator.service';
import { PayoutProviderFactory } from './providers/payout-provider.factory';
import { PayoutProviderState } from './providers/payout-provider.interface';

export interface WebhookResult {
  payout?: Payout;
  verified: boolean;
  reason?: string;
}

@Injectable()
export class PayoutStatusService {
  private readonly logger = new Logger(PayoutStatusService.name);

  constructor(
    @InjectRepository(Payout) private readonly payouts: Repository<Payout>,
    private readonly providerFactory: PayoutProviderFactory,
    private readonly orchestrator: PayoutOrchestratorService,
  ) {}

  async verifyPayout(payoutId: string): Promise<Payout> {
    const payout = await this.payouts.findOne({ where: { id: payoutId } });
    if (!payout) throw new NotFoundException('Payout not found');
    if (payout.status !== PayoutStatus.PENDING && payout.status !== PayoutStatus.PROCESSING) {
      throw new BadRequestException('Payout is not in a verifiable state');
    }

    const provider = this.providerFactory.get(payout.provider);
    const result = await provider.verify(payout.reference);
    return this.orchestrator.applyProviderResult(payout.id, {
      status: result.status,
      providerReference: result.providerReference,
      failureReason: result.failureReason,
      providerPayload: result.providerPayload,
    });
  }

  async handleWebhook(providerName: string, payload: unknown, signature?: string): Promise<WebhookResult> {
    const provider = this.providerFactory.get(providerName);
    if (!provider.verifyWebhook) {
      return { verified: false, reason: 'Provider does not support webhook verification' };
    }

    const verification = provider.verifyWebhook(payload, signature ?? '');
    if (!verification.valid) {
      return { verified: false, reason: verification.reason };
    }
    if (!verification.reference) {
      return { verified: false, reason: 'Webhook did not include a reference' };
    }

    const payout = await this.payouts.findOne({ where: { reference: verification.reference } });
    if (!payout) {
      return { verified: false, reason: 'Payout not found for reference' };
    }

    const updated = await this.orchestrator.applyProviderResult(payout.id, {
      status: verification.status ?? 'unknown',
      providerReference: payout.providerReference,
      providerPayload: verification.payload,
    });
    return { verified: true, payout: updated };
  }

  async findStalePayouts(olderThanMinutes = 5): Promise<Payout[]> {
    const threshold = new Date(Date.now() - olderThanMinutes * 60 * 1000);
    return this.payouts.find({
      where: [
        { status: PayoutStatus.PENDING, createdAt: LessThan(threshold) },
        { status: PayoutStatus.PROCESSING, createdAt: LessThan(threshold) },
      ],
      order: { createdAt: 'ASC' },
      take: 100,
    });
  }

  mapPayoutStatusToProviderState(status: PayoutStatus): PayoutProviderState {
    switch (status) {
      case PayoutStatus.COMPLETED:
        return 'completed';
      case PayoutStatus.FAILED:
        return 'failed';
      case PayoutStatus.CANCELLED:
        return 'cancelled';
      case PayoutStatus.PROCESSING:
        return 'processing';
      case PayoutStatus.PENDING:
        return 'pending';
      default:
        return 'unknown';
    }
  }
}
