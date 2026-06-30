export interface SettlementRecord {
  providerReference: string;
  externalSettlementId?: string;
  settledAmount: number;
  currency: string;
  settledAt?: Date;
  provider?: string;
  metadata?: Record<string, unknown>;
}

export interface SettlementAdapter {
  readonly provider: string;
  fetchRecords(periodStart: Date, periodEnd: Date): Promise<SettlementRecord[]>;
  parseUploadedFile(
    file: Buffer,
    mimeType: string,
    options?: Record<string, unknown>,
  ): Promise<SettlementRecord[]>;
}
