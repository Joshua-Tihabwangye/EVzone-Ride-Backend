import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ScanAdapter, ScanResult } from './scan-adapter.interface';

@Injectable()
export class WebhookScanAdapter implements ScanAdapter {
  readonly providerName = 'WEBHOOK';
  private readonly logger = new Logger(WebhookScanAdapter.name);

  constructor(private readonly config: ConfigService) {}

  async scan(buffer: Buffer, metadata?: Record<string, unknown>): Promise<ScanResult> {
    const url = this.config.get<string>('FILE_SCAN_WEBHOOK_URL')?.trim();
    if (!url) {
      return { status: 'ERROR', reason: 'FILE_SCAN_WEBHOOK_URL is not configured' };
    }

    const timeoutMs = Number(this.config.get<string>('FILE_SCAN_TIMEOUT_MS') ?? 30_000);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contentBase64: buffer.toString('base64'),
          filename: metadata?.originalName,
          mimeType: metadata?.mimeType,
          sizeBytes: metadata?.sizeBytes,
          ownerUserId: metadata?.ownerUserId,
        }),
        signal: AbortSignal.timeout(timeoutMs),
      });

      const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
      if (!response.ok) {
        return {
          status: 'ERROR',
          reason: `Scanner webhook returned HTTP ${response.status}`,
          details: body,
        };
      }

      const status = String(body.status ?? '').toUpperCase();
      if (status === 'CLEAN' || status === 'SAFE') {
        return { status: 'CLEAN', details: body };
      }
      if (status === 'INFECTED' || status === 'MALICIOUS' || status === 'THREAT') {
        return { status: 'INFECTED', reason: String(body.reason ?? 'Threat detected'), details: body };
      }
      return { status: 'ERROR', reason: `Unknown scanner status: ${status}`, details: body };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Webhook scanner request failed: ${message}`);
      return { status: 'ERROR', reason: `Webhook scanner request failed: ${message}` };
    }
  }
}
