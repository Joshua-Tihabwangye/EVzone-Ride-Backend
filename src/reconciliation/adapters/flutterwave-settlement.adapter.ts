import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SettlementAdapter, SettlementRecord } from './settlement-adapter.interface';

interface FlutterwaveTransferListResponse {
  status?: string;
  message?: string;
  meta?: { page_info?: { total?: number } };
  data?: Array<{
    id?: number;
    reference?: string;
    status?: string;
    amount?: number;
    currency?: string;
    created_at?: string;
    fee?: number;
  }>;
}

@Injectable()
export class FlutterwaveSettlementAdapter implements SettlementAdapter {
  readonly provider = 'FLUTTERWAVE';
  private readonly logger = new Logger(FlutterwaveSettlementAdapter.name);

  constructor(private readonly config: ConfigService) {}

  async fetchRecords(periodStart: Date, periodEnd: Date): Promise<SettlementRecord[]> {
    const secret = this.config.get<string>('FLUTTERWAVE_SECRET_KEY')?.trim();
    if (!secret) {
      this.logger.warn('Flutterwave secret key not configured; returning empty settlement list');
      return [];
    }

    const baseUrl = this.baseUrl();
    const records: SettlementRecord[] = [];
    let page = 1;
    const perPage = 100;

    while (true) {
      try {
        const response = await fetch(
          `${baseUrl}/v3/transfers?status=SUCCESSFUL&page=${page}&per_page=${perPage}&from=${periodStart.toISOString()}&to=${periodEnd.toISOString()}`,
          {
            method: 'GET',
            headers: {
              accept: 'application/json',
              authorization: `Bearer ${secret}`,
            },
            signal: AbortSignal.timeout(this.timeoutMs()),
          },
        );
        const body = (await response.json().catch(() => ({}))) as FlutterwaveTransferListResponse;
        const data = body.data ?? [];
        for (const item of data) {
          if (item.reference && typeof item.amount === 'number') {
            records.push({
              providerReference: item.reference,
              externalSettlementId: item.id ? String(item.id) : undefined,
              settledAmount: item.amount,
              currency: item.currency ?? 'UGX',
              settledAt: item.created_at ? new Date(item.created_at) : undefined,
              metadata: { fee: item.fee, status: item.status },
            });
          }
        }
        const total = body.meta?.page_info?.total ?? records.length;
        if (records.length >= total || data.length < perPage) break;
        page += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.warn(`Flutterwave settlement fetch failed: ${message}`);
        return records;
      }
    }

    return records;
  }

  async parseUploadedFile(file: Buffer, mimeType: string): Promise<SettlementRecord[]> {
    if (!mimeType.includes('csv') && !mimeType.includes('spreadsheet') && !mimeType.includes('excel')) {
      throw new Error('Unsupported settlement file format');
    }
    const text = file.toString('utf-8');
    return this.parseCsv(text);
  }

  private parseCsv(text: string): SettlementRecord[] {
    const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
    if (lines.length < 2) return [];
    const header = lines[0]
      .toLowerCase()
      .split(',')
      .map((h) => h.trim());
    const referenceIdx = header.findIndex((h) => h.includes('reference') || h.includes('tx_ref'));
    const amountIdx = header.findIndex((h) => h.includes('amount'));
    const currencyIdx = header.findIndex((h) => h.includes('currency'));
    const settledAtIdx = header.findIndex((h) => h.includes('date') || h.includes('settled'));

    if (referenceIdx < 0 || amountIdx < 0) {
      throw new Error('CSV must contain reference and amount columns');
    }

    const records: SettlementRecord[] = [];
    for (let i = 1; i < lines.length; i++) {
      const columns = lines[i].split(',').map((c) => c.trim());
      const reference = columns[referenceIdx];
      const amount = Number(columns[amountIdx]);
      if (!reference || Number.isNaN(amount)) continue;
      records.push({
        providerReference: reference,
        settledAmount: amount,
        currency: currencyIdx >= 0 ? columns[currencyIdx] : 'UGX',
        settledAt: settledAtIdx >= 0 && columns[settledAtIdx] ? new Date(columns[settledAtIdx]) : undefined,
      });
    }
    return records;
  }

  private baseUrl(): string {
    return (this.config.get<string>('FLUTTERWAVE_BASE_URL') ?? 'https://api.flutterwave.com').replace(
      /\/$/,
      '',
    );
  }

  private timeoutMs(): number {
    return Number(this.config.get<string>('FLUTTERWAVE_REQUEST_TIMEOUT_MS') ?? 10_000);
  }
}
