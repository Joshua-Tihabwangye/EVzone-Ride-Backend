import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import {
  CashoutRequestStatus,
  PaymentStatus,
  PayoutStatus,
  TransactionDirection,
  WalletTransactionType,
} from '../common/enums';
import { CashoutRequest, Payout, Wallet, WalletTransaction } from '../database/entities';
import { AccountingService } from '../accounting/accounting.service';
import { WalletsService } from '../wallets/wallets.service';
import { PayoutProviderFactory } from './providers/payout-provider.factory';
import {
  PayoutDestination,
  PayoutInitiationResult,
  PayoutProviderAdapter,
  PayoutProviderState,
} from './providers/payout-provider.interface';

export interface PayoutFromCashoutResult {
  payout: Payout;
  cashout: CashoutRequest;
  providerResult: PayoutInitiationResult;
}

@Injectable()
export class PayoutOrchestratorService {
  private readonly logger = new Logger(PayoutOrchestratorService.name);

  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Payout) private readonly payouts: Repository<Payout>,
    @InjectRepository(CashoutRequest) private readonly cashouts: Repository<CashoutRequest>,
    @InjectRepository(Wallet) private readonly wallets: Repository<Wallet>,
    @InjectRepository(WalletTransaction) private readonly walletTransactions: Repository<WalletTransaction>,
    private readonly accounting: AccountingService,
    private readonly walletsService: WalletsService,
    private readonly providerFactory: PayoutProviderFactory,
  ) {}

  async payoutFromCashout(
    cashoutId: string,
    reviewerId: string,
    options?: { providerName?: string; idempotencyKey?: string },
  ): Promise<PayoutFromCashoutResult> {
    const cashout = await this.cashouts.findOne({ where: { id: cashoutId } });
    if (!cashout) throw new NotFoundException('Cashout request not found');
    if (cashout.status !== CashoutRequestStatus.PENDING) {
      const existing = await this.findExistingPayout(
        cashout.id,
        options?.idempotencyKey ?? cashout.reference,
      );
      if (existing) {
        return {
          payout: existing,
          cashout,
          providerResult: { status: this.toProviderState(existing.status) },
        };
      }
      throw new ConflictException('Cashout request is not pending');
    }

    const idempotencyKey = options?.idempotencyKey ?? cashout.reference;
    const existingPayout = await this.findExistingPayout(cashout.id, idempotencyKey);
    if (existingPayout) {
      return {
        payout: existingPayout,
        cashout,
        providerResult: { status: this.toProviderState(existingPayout.status) },
      };
    }

    const destination = this.destination(cashout.method);
    const provider = this.providerFactory.get(options?.providerName ?? cashout.provider);
    const providerValidation: { valid: boolean; reason?: string } =
      'validateDestination' in provider
        ? (
            provider as PayoutProviderAdapter & {
              validateDestination(dest: PayoutDestination): { valid: boolean; reason?: string };
            }
          ).validateDestination(destination)
        : { valid: true };
    if (!providerValidation.valid) {
      throw new BadRequestException(providerValidation.reason ?? 'Invalid payout destination');
    }

    const reference = `PO-${cashout.reference}`;
    const amount = Number(cashout.amount);
    const currency = cashout.currency ?? 'UGX';

    const payout = await this.dataSource.transaction<Payout>(async (manager) => {
      const isPostgres = this.dataSource.options.type !== 'sqljs';
      const cashoutRepo = manager.getRepository(CashoutRequest);
      const walletRepo = manager.getRepository(Wallet);
      const txRepo = manager.getRepository(WalletTransaction);
      const payoutRepo = manager.getRepository(Payout);

      const lockedCashout = await cashoutRepo.findOne({
        where: { id: cashoutId },
        ...(isPostgres ? { lock: { mode: 'pessimistic_write' } as const } : {}),
      });
      if (!lockedCashout) throw new NotFoundException('Cashout request not found');
      if (lockedCashout.status !== CashoutRequestStatus.PENDING) {
        throw new ConflictException('Cashout request is not pending');
      }

      const wallet = await walletRepo.findOne({
        where: { userId: lockedCashout.userId },
        ...(isPostgres ? { lock: { mode: 'pessimistic_write' } as const } : {}),
      });
      if (!wallet) throw new BadRequestException('Wallet not found');
      if (Number(wallet.reservedForCashout) < amount) {
        throw new BadRequestException('Reserved balance is insufficient for payout');
      }

      const existingDebit = await txRepo.findOne({
        where: { walletId: wallet.id, reference, direction: TransactionDirection.DEBIT },
      });
      if (!existingDebit) {
        wallet.reservedForCashout = Number(wallet.reservedForCashout) - amount;
        await walletRepo.save(wallet);
        await txRepo.save(
          txRepo.create({
            walletId: wallet.id,
            type: WalletTransactionType.PAYOUT,
            direction: TransactionDirection.DEBIT,
            amount,
            balanceAfter: wallet.availableBalance,
            reference,
            status: PaymentStatus.PAID,
            description: 'Driver payout',
            metadata: { cashoutRequestId: lockedCashout.id },
          }),
        );
      }

      const newPayout = await payoutRepo.save(
        payoutRepo.create({
          driverId: lockedCashout.userId,
          cashoutRequestId: lockedCashout.id,
          reference,
          idempotencyKey,
          amount,
          currency,
          status: PayoutStatus.PENDING,
          provider: provider.name,
          destination: destination.phone ?? destination.accountNumber ?? '',
          destinationDetails: destination as Record<string, unknown>,
          initiatedByUserId: reviewerId,
          initiatedAt: new Date(),
        }),
      );

      lockedCashout.status = CashoutRequestStatus.PROCESSING;
      lockedCashout.payoutId = newPayout.id;
      lockedCashout.provider = provider.name;
      lockedCashout.reviewedByUserId = reviewerId;
      lockedCashout.reviewedAt = new Date();
      await cashoutRepo.save(lockedCashout);

      return newPayout;
    });

    try {
      await this.accounting.postWalletMovement({
        userId: cashout.userId,
        amount,
        direction: TransactionDirection.DEBIT,
        type: WalletTransactionType.PAYOUT,
        reference,
        currency,
        description: 'Driver payout',
        metadata: { cashoutRequestId: cashout.id },
      });
    } catch (error) {
      this.logger.warn(
        `Failed to post payout journal for ${reference}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    const providerResult = await provider.initiate({
      reference: payout.reference,
      idempotencyKey,
      amount,
      currency,
      destination,
      narration: 'EVzone driver payout',
      metadata: { cashoutRequestId: cashout.id },
    });

    await this.applyProviderResult(payout.id, providerResult, provider);
    const updatedPayout = await this.payouts.findOne({ where: { id: payout.id } });
    const updatedCashout = await this.cashouts.findOne({ where: { id: cashout.id } });
    return {
      payout: updatedPayout ?? payout,
      cashout: updatedCashout ?? cashout,
      providerResult,
    };
  }

  async retryPayout(payoutId: string): Promise<Payout> {
    const payout = await this.payouts.findOne({ where: { id: payoutId } });
    if (!payout) throw new NotFoundException('Payout not found');
    if (payout.status !== PayoutStatus.FAILED && payout.status !== PayoutStatus.PENDING) {
      throw new ConflictException('Only failed or pending payouts can be retried');
    }

    const cashout = payout.cashoutRequestId
      ? await this.cashouts.findOne({ where: { id: payout.cashoutRequestId } })
      : undefined;
    if (payout.status === PayoutStatus.FAILED && cashout) {
      cashout.status = CashoutRequestStatus.PROCESSING;
      cashout.failureReason = undefined;
      await this.cashouts.save(cashout);
    }

    const provider = this.providerFactory.get(payout.provider);
    const destination: PayoutDestination = {
      ...(payout.destinationDetails ?? {}),
      phone: payout.destination,
    };
    const providerResult = await provider.initiate({
      reference: payout.reference,
      idempotencyKey: payout.idempotencyKey,
      amount: Number(payout.amount),
      currency: payout.currency,
      destination,
      narration: 'EVzone driver payout retry',
    });

    await this.applyProviderResult(payout.id, providerResult, provider);
    const updated = await this.payouts.findOne({ where: { id: payout.id } });
    return updated ?? payout;
  }

  async cancelPayout(payoutId: string): Promise<Payout> {
    const payout = await this.payouts.findOne({ where: { id: payoutId } });
    if (!payout) throw new NotFoundException('Payout not found');
    if (payout.status !== PayoutStatus.PENDING && payout.status !== PayoutStatus.PROCESSING) {
      throw new ConflictException('Only pending or processing payouts can be cancelled');
    }

    const provider = this.providerFactory.get(payout.provider);
    const cancelled = await provider.cancel(payout.reference);
    if (!cancelled) {
      throw new ConflictException('Provider did not confirm cancellation');
    }

    await this.dataSource.transaction(async (manager) => {
      const payoutRepo = manager.getRepository(Payout);
      const cashoutRepo = manager.getRepository(CashoutRequest);

      payout.status = PayoutStatus.CANCELLED;
      await payoutRepo.save(payout);

      if (payout.cashoutRequestId) {
        const cashout = await cashoutRepo.findOne({ where: { id: payout.cashoutRequestId } });
        if (cashout) {
          cashout.status = CashoutRequestStatus.CANCELLED;
          await cashoutRepo.save(cashout);
        }
      }
    });

    await this.refundWallet(payout.driverId, Number(payout.amount), payout.reference);
    return (await this.payouts.findOne({ where: { id: payout.id } })) ?? payout;
  }

  async applyProviderResult(
    payoutId: string,
    result:
      | PayoutInitiationResult
      | { status: PayoutProviderState; providerReference?: string; failureReason?: string },
    provider?: PayoutProviderAdapter,
  ): Promise<Payout> {
    const status = this.toPayoutStatus(result.status);
    const isFinal = [PayoutStatus.COMPLETED, PayoutStatus.FAILED, PayoutStatus.CANCELLED].includes(status);

    await this.dataSource.transaction(async (manager) => {
      const payoutRepo = manager.getRepository(Payout);
      const cashoutRepo = manager.getRepository(CashoutRequest);

      const payout = await payoutRepo.findOne({ where: { id: payoutId } });
      if (!payout) throw new NotFoundException('Payout not found');
      if (isFinal && payout.status !== PayoutStatus.PENDING && payout.status !== PayoutStatus.PROCESSING) {
        return;
      }

      payout.status = status;
      if ('providerReference' in result && result.providerReference) {
        payout.providerReference = result.providerReference;
      }
      if ('fee' in result && typeof result.fee === 'number') {
        payout.fee = result.fee;
      }
      if ('providerPayload' in result && result.providerPayload) {
        payout.providerPayload = result.providerPayload;
      }
      if ('providerError' in result && result.providerError) {
        payout.providerError = result.providerError;
      }
      if ('failureReason' in result && result.failureReason) {
        payout.failureReason = result.failureReason;
      }

      if (status === PayoutStatus.COMPLETED) {
        payout.completedAt = new Date();
      } else if (status === PayoutStatus.FAILED) {
        payout.failedAt = new Date();
      }

      await payoutRepo.save(payout);

      if (payout.cashoutRequestId) {
        const cashout = await cashoutRepo.findOne({ where: { id: payout.cashoutRequestId } });
        if (cashout) {
          if (status === PayoutStatus.COMPLETED) {
            cashout.status = CashoutRequestStatus.PAID;
            cashout.processedAt = new Date();
            cashout.providerReference = payout.providerReference;
          } else if (status === PayoutStatus.FAILED) {
            cashout.status = CashoutRequestStatus.FAILED;
            cashout.failureReason = payout.failureReason ?? 'Payout provider failed';
          }
          await cashoutRepo.save(cashout);
        }
      }
    });

    const payout = (await this.payouts.findOne({ where: { id: payoutId } }))!;

    if (status === PayoutStatus.FAILED) {
      await this.refundWallet(payout.driverId, Number(payout.amount), payout.reference);
    }

    if (status === PayoutStatus.COMPLETED && provider && payout.cashoutRequestId) {
      const cashout = await this.cashouts.findOne({ where: { id: payout.cashoutRequestId } });
      if (cashout && !cashout.ledgerJournalReference) {
        cashout.ledgerJournalReference = `WALLET-${payout.reference}-DEBIT-${payout.driverId}`;
        await this.cashouts.save(cashout);
      }
    }

    return payout;
  }

  async findExistingPayout(cashoutRequestId: string, idempotencyKey: string): Promise<Payout | null> {
    return this.payouts.findOne({ where: { cashoutRequestId, idempotencyKey } });
  }

  private async refundWallet(userId: string, amount: number, reference: string) {
    await this.walletsService.credit(
      userId,
      amount,
      WalletTransactionType.CASHOUT_RELEASE,
      `${reference}-REFUND`,
      'Payout failure refund',
      { sourceReference: reference },
    );
  }

  private destination(method: Record<string, unknown>): PayoutDestination {
    const target = method.phone ?? method.accountNumber ?? method.destination ?? method.label;
    if (typeof target !== 'string' || target.trim().length < 3) {
      throw new BadRequestException('Cashout method requires phone, accountNumber or destination');
    }
    return {
      type: typeof method.type === 'string' ? method.type : 'mobile_money',
      phone: typeof method.phone === 'string' ? method.phone.trim() : undefined,
      accountNumber: typeof method.accountNumber === 'string' ? method.accountNumber.trim() : undefined,
      bankCode: typeof method.bankCode === 'string' ? method.bankCode.trim() : undefined,
      bankName: typeof method.bankName === 'string' ? method.bankName.trim() : undefined,
      accountName: typeof method.accountName === 'string' ? method.accountName.trim() : undefined,
      country: typeof method.country === 'string' ? method.country.trim() : undefined,
      currency: typeof method.currency === 'string' ? method.currency.trim() : undefined,
    };
  }

  private toPayoutStatus(state: PayoutProviderState): PayoutStatus {
    switch (state) {
      case 'completed':
        return PayoutStatus.COMPLETED;
      case 'failed':
        return PayoutStatus.FAILED;
      case 'cancelled':
        return PayoutStatus.CANCELLED;
      case 'processing':
        return PayoutStatus.PROCESSING;
      case 'pending':
        return PayoutStatus.PENDING;
      default:
        return PayoutStatus.PENDING;
    }
  }

  private toProviderState(status: PayoutStatus): PayoutProviderState {
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
