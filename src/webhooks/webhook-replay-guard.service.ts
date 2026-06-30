import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface WebhookTimestampCheck {
  valid: boolean;
  reason?: string;
}

@Injectable()
export class WebhookReplayGuardService {
  constructor(private readonly config: ConfigService) {}

  checkTimestamp(
    provider: string,
    headers: Record<string, string | string[] | undefined>,
  ): WebhookTimestampCheck {
    const normalized = provider.trim().toUpperCase();
    const toleranceSeconds = Number(this.config.get<string>('WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS') ?? 300);

    if (normalized === 'CORPORATEPAY') {
      const raw = headers['x-corporatepay-timestamp'];
      const timestamp = Array.isArray(raw) ? raw[0] : raw;
      if (!timestamp) return { valid: true };
      return this.validateUnixOrIso(timestamp, toleranceSeconds);
    }

    // Paytota docs do not specify a timestamp header; rely on event-id dedup.
    // Flutterwave also relies on signature + event-id dedup.
    return { valid: true };
  }

  private validateUnixOrIso(value: string, toleranceSeconds: number): WebhookTimestampCheck {
    const parsed = /(^\d{4}-)|(^\d{4}\/)/.test(value) ? Date.parse(value) : Number(value) * 1000;
    if (!Number.isFinite(parsed)) {
      return { valid: false, reason: 'WEBHOOK_TIMESTAMP_INVALID' };
    }
    const deltaSeconds = Math.abs(Date.now() - parsed) / 1000;
    if (deltaSeconds > toleranceSeconds) {
      return { valid: false, reason: 'WEBHOOK_TIMESTAMP_OUT_OF_TOLERANCE' };
    }
    return { valid: true };
  }
}
