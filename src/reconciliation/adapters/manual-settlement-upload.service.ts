import { BadRequestException, Injectable } from '@nestjs/common';
import * as XLSX from 'xlsx';
import { SettlementRecord } from './settlement-adapter.interface';

export interface SettlementUploadOptions {
  provider?: string;
  referenceColumn?: string;
  amountColumn?: string;
  currencyColumn?: string;
  dateColumn?: string;
  currencyFallback?: string;
}

@Injectable()
export class ManualSettlementUploadService {
  async parse(
    file: Buffer,
    mimeType: string,
    options: SettlementUploadOptions = {},
  ): Promise<{ provider: string; records: SettlementRecord[] }> {
    const provider = options.provider ?? 'MANUAL';
    if (mimeType.includes('csv') || file.toString('utf-8').includes(',')) {
      return { provider, records: this.parseCsv(file.toString('utf-8'), options) };
    }
    if (mimeType.includes('spreadsheet') || mimeType.includes('excel') || mimeType.includes('sheet')) {
      return { provider, records: this.parseExcel(file, options) };
    }
    throw new BadRequestException('Unsupported settlement file format; upload CSV or Excel');
  }

  private parseCsv(text: string, options: SettlementUploadOptions): SettlementRecord[] {
    const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
    if (lines.length < 2) return [];
    const headers = lines[0].split(',').map((h) => h.trim().toLowerCase());
    return this.mapRows(
      lines.slice(1).map((line) => line.split(',').map((c) => c.trim())),
      headers,
      options,
    );
  }

  private parseExcel(file: Buffer, options: SettlementUploadOptions): SettlementRecord[] {
    const workbook = XLSX.read(file, { type: 'buffer' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<Array<string | number>>(sheet, { header: 1 }) as string[][];
    if (rows.length < 2) return [];
    const headers = rows[0].map((h) => String(h).trim().toLowerCase());
    return this.mapRows(rows.slice(1), headers, options);
  }

  private mapRows(
    rows: Array<Array<string | number | undefined>>,
    headers: string[],
    options: SettlementUploadOptions,
  ): SettlementRecord[] {
    const referenceKey = (options.referenceColumn ?? 'reference').toLowerCase();
    const amountKey = (options.amountColumn ?? 'amount').toLowerCase();
    const currencyKey = (options.currencyColumn ?? 'currency').toLowerCase();
    const dateKey = (options.dateColumn ?? 'settled_at').toLowerCase();
    const refIdx = this.findColumnIndex(headers, referenceKey);
    const amountIdx = this.findColumnIndex(headers, amountKey);
    const currencyIdx = this.findColumnIndex(headers, currencyKey);
    const dateIdx = this.findColumnIndex(headers, dateKey);

    if (refIdx < 0 || amountIdx < 0) {
      throw new BadRequestException('Settlement file must contain reference and amount columns');
    }

    const records: SettlementRecord[] = [];
    for (const row of rows) {
      const reference = String(row[refIdx] ?? '').trim();
      const amount = Number(row[amountIdx]);
      if (!reference || Number.isNaN(amount)) continue;
      records.push({
        providerReference: reference,
        settledAmount: amount,
        currency:
          currencyIdx >= 0 && row[currencyIdx]
            ? String(row[currencyIdx]).trim()
            : (options.currencyFallback ?? 'UGX'),
        settledAt: dateIdx >= 0 && row[dateIdx] ? new Date(String(row[dateIdx])) : undefined,
      });
    }
    return records;
  }

  private findColumnIndex(headers: string[], key: string): number {
    return headers.findIndex((h) => h === key || h.replace(/[_\s]/g, '') === key.replace(/[_\s]/g, ''));
  }
}
