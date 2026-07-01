import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, FindOptionsWhere, Repository } from 'typeorm';
import { CorporatePayTransaction } from '../database/entities';
import { ReconciliationRecord } from './entities/reconciliation-record.entity';
import { ReconciliationRun } from './entities/reconciliation-run.entity';
import {
  CorporatePayTransactionStatus,
  ReconciliationRunStatus,
  ReconciliationStatus,
} from '../common/enums';
import { PaymentsService } from '../payments/payments.service';
import { PayoutOrchestratorService } from '../payouts/payout-orchestrator.service';
import { ManualSettlementUploadService } from './adapters/manual-settlement-upload.service';
import { SettlementAdapterFactory } from './adapters/settlement-adapter.factory';
import { SettlementRecord } from './adapters/settlement-adapter.interface';

export interface InternalRecord {
  id: string;
  reference: string;
  providerReference?: string;
  amount: number;
  currency: string;
  provider?: string;
  settledAt?: Date;
}

export interface StartReconciliationRunInput {
  type: string;
  periodStart: Date;
  periodEnd: Date;
  provider?: string;
  tolerance?: number;
  createdByUserId?: string;
  fileContent?: string;
  fileMimeType?: string;
  columnMapping?: Record<string, string>;
}

export interface ResolveRecordInput {
  status: ReconciliationStatus.RESOLVED | ReconciliationStatus.IGNORED;
  resolution?: string;
}

@Injectable()
export class ReconciliationService {
  constructor(
    @InjectRepository(ReconciliationRun) private readonly runs: Repository<ReconciliationRun>,
    @InjectRepository(ReconciliationRecord) private readonly records: Repository<ReconciliationRecord>,
    @InjectRepository(CorporatePayTransaction)
    private readonly corporateTransactions: Repository<CorporatePayTransaction>,
    private readonly paymentsService: PaymentsService,
    private readonly payoutOrchestrator: PayoutOrchestratorService,
    private readonly adapterFactory: SettlementAdapterFactory,
    private readonly manualUpload: ManualSettlementUploadService,
    private readonly events: EventEmitter2,
  ) {}

  async startRun(input: StartReconciliationRunInput): Promise<ReconciliationRun> {
    if (input.periodStart >= input.periodEnd) {
      throw new BadRequestException('periodStart must be before periodEnd');
    }

    const run = await this.runs.save(
      this.runs.create({
        type: input.type.toUpperCase(),
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
        status: ReconciliationRunStatus.RUNNING,
        createdByUserId: input.createdByUserId,
      }),
    );

    try {
      const internalRecords = await this.loadInternalRecords(input.type, input.periodStart, input.periodEnd);
      const settlementRecords = await this.loadSettlementRecords(input);
      await this.matchRecords(run, internalRecords, settlementRecords, input.tolerance ?? 0.01);
      const summary = await this.summarizeRun(run.id);
      run.status = ReconciliationRunStatus.COMPLETED;
      run.summary = summary;
      run.completedAt = new Date();
      await this.runs.save(run);
      return run;
    } catch (error) {
      run.status = ReconciliationRunStatus.FAILED;
      run.summary = { error: error instanceof Error ? error.message : String(error) };
      await this.runs.save(run);
      throw error;
    }
  }

  async listRuns(type?: string, status?: ReconciliationRunStatus) {
    const where: FindOptionsWhere<ReconciliationRun> = {};
    if (type) where.type = type.toUpperCase();
    if (status) where.status = status;
    return this.runs.find({ where, order: { createdAt: 'DESC' }, take: 200 });
  }

  async getRun(id: string) {
    const run = await this.runs.findOne({ where: { id } });
    if (!run) throw new NotFoundException('Reconciliation run not found');
    return run;
  }

  async listRecords(runId: string, status?: ReconciliationStatus) {
    const where: FindOptionsWhere<ReconciliationRecord> = { runId };
    if (status) where.status = status;
    return this.records.find({ where, order: { createdAt: 'DESC' }, take: 1000 });
  }

  async resolveRecord(recordId: string, input: ResolveRecordInput, userId: string) {
    const record = await this.records.findOne({ where: { id: recordId } });
    if (!record) throw new NotFoundException('Reconciliation record not found');
    if (![ReconciliationStatus.RESOLVED, ReconciliationStatus.IGNORED].includes(input.status)) {
      throw new BadRequestException('Resolution status must be RESOLVED or IGNORED');
    }
    record.status = input.status;
    record.resolution = input.resolution;
    record.resolvedByUserId = userId;
    record.resolvedAt = new Date();
    return this.records.save(record);
  }

  async retryRun(id: string, createdByUserId?: string) {
    const run = await this.getRun(id);
    if (run.status === ReconciliationRunStatus.RUNNING) {
      throw new BadRequestException('Run is already in progress');
    }
    return this.startRun({
      type: run.type,
      periodStart: run.periodStart,
      periodEnd: run.periodEnd,
      createdByUserId,
    });
  }

  private async loadInternalRecords(
    type: string,
    periodStart: Date,
    periodEnd: Date,
  ): Promise<InternalRecord[]> {
    switch (type.toUpperCase()) {
      case 'PAYMENTS': {
        const payments = await this.paymentsService.getSettlementRecords(periodStart, periodEnd);
        return payments.map((payment) => ({
          id: payment.id,
          reference: payment.reference,
          providerReference: payment.providerReference ?? undefined,
          amount: Number(payment.amount),
          currency: payment.currency,
          provider: payment.provider,
          settledAt: payment.paidAt ?? undefined,
        }));
      }
      case 'PAYOUTS': {
        const payouts = await this.payoutOrchestrator.getSettlementRecords(periodStart, periodEnd);
        return payouts.map((payout) => ({
          id: payout.id,
          reference: payout.reference,
          providerReference: payout.providerReference ?? undefined,
          amount: Number(payout.amount),
          currency: payout.currency,
          provider: payout.provider,
          settledAt: payout.completedAt ?? undefined,
        }));
      }
      case 'CORPORATEPAY': {
        const transactions = await this.corporateTransactions.find({
          where: {
            status: CorporatePayTransactionStatus.PAID,
            paidAt: Between(periodStart, periodEnd),
          },
        });
        return transactions.map((txn) => ({
          id: txn.id,
          reference: txn.reference,
          providerReference: txn.externalTransactionId ?? undefined,
          amount: Number(txn.amount),
          currency: txn.currency,
          provider: 'CORPORATEPAY',
          settledAt: txn.paidAt ?? undefined,
        }));
      }
      default:
        throw new BadRequestException(`Unsupported reconciliation type: ${type}`);
    }
  }

  private async loadSettlementRecords(input: StartReconciliationRunInput): Promise<SettlementRecord[]> {
    if (input.fileContent) {
      const buffer = Buffer.from(input.fileContent, 'base64');
      const { records } = await this.manualUpload.parse(buffer, input.fileMimeType ?? 'text/csv', {
        provider: input.provider,
        ...input.columnMapping,
      });
      return records;
    }

    if (!input.provider) {
      throw new BadRequestException('Either provider or an uploaded settlement file is required');
    }

    const adapter = this.adapterFactory.get(input.provider);
    return adapter.fetchRecords(input.periodStart, input.periodEnd);
  }

  private async matchRecords(
    run: ReconciliationRun,
    internalRecords: InternalRecord[],
    settlementRecords: SettlementRecord[],
    tolerance: number,
  ) {
    const settlementMap = new Map<string, SettlementRecord>();
    for (const record of settlementRecords) {
      settlementMap.set(record.providerReference.toLowerCase(), record);
    }

    const matchedSettlementRefs = new Set<string>();
    const recordsToSave: ReconciliationRecord[] = [];

    for (const internal of internalRecords) {
      const key = (internal.providerReference ?? internal.reference).toLowerCase();
      const settlement = settlementMap.get(key);
      let status = ReconciliationStatus.OPEN;
      let settledAmount = 0;
      let variance = -internal.amount;

      if (settlement) {
        matchedSettlementRefs.add(key);
        settledAmount = settlement.settledAmount;
        variance = Math.round((settledAmount - internal.amount) * 100) / 100;
        const withinTolerance = Math.abs(variance) <= tolerance && settlement.currency === internal.currency;
        status = withinTolerance ? ReconciliationStatus.MATCHED : ReconciliationStatus.VARIANCE;
      }

      recordsToSave.push(
        this.records.create({
          runId: run.id,
          internalRecordType: run.type,
          internalRecordId: internal.id,
          providerReference: internal.providerReference ?? internal.reference,
          expectedAmount: internal.amount,
          settledAmount,
          variance,
          status,
          provider: settlement?.provider ?? internal.provider,
          statementDate: settlement?.settledAt,
          metadata: { internalReference: internal.reference, settlementCurrency: settlement?.currency },
        }),
      );
    }

    for (const [key, settlement] of settlementMap.entries()) {
      if (matchedSettlementRefs.has(key)) continue;
      recordsToSave.push(
        this.records.create({
          runId: run.id,
          internalRecordType: 'UNKNOWN',
          internalRecordId: '',
          providerReference: settlement.providerReference,
          expectedAmount: 0,
          settledAmount: settlement.settledAmount,
          variance: settlement.settledAmount,
          status: ReconciliationStatus.OPEN,
          provider: settlement.provider,
          statementDate: settlement.settledAt,
          metadata: { source: 'settlement_only' },
        }),
      );
    }

    await this.records.save(recordsToSave);

    const variances = recordsToSave.filter(
      (r) => r.status === ReconciliationStatus.VARIANCE || r.status === ReconciliationStatus.OPEN,
    );
    if (variances.length > 0) {
      this.events.emit('reconciliation.variance_detected', {
        runId: run.id,
        runType: run.type,
        count: variances.length,
        records: variances.map((r) => ({ id: r.id, status: r.status, variance: r.variance })),
      });
    }
  }

  private async summarizeRun(runId: string): Promise<Record<string, unknown>> {
    const all = await this.records.find({ where: { runId } });
    const summary = {
      total: all.length,
      matched: all.filter((r) => r.status === ReconciliationStatus.MATCHED).length,
      variance: all.filter((r) => r.status === ReconciliationStatus.VARIANCE).length,
      open: all.filter((r) => r.status === ReconciliationStatus.OPEN).length,
      expectedTotal: all.reduce((sum, r) => sum + Number(r.expectedAmount), 0),
      settledTotal: all.reduce((sum, r) => sum + Number(r.settledAmount), 0),
      varianceTotal: all.reduce((sum, r) => sum + Number(r.variance), 0),
    };
    return summary;
  }
}
