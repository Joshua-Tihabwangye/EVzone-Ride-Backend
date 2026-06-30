import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  publicKeyFingerprint,
  verifyPayloadSignature,
  verifyRsaSignature,
} from '../common/utils/crypto-vault';

export interface WebhookSignatureVerification {
  valid: boolean;
  fingerprint?: string;
}

@Injectable()
export class WebhookSignatureService {
  constructor(private readonly config: ConfigService) {}

  verify(provider: string, rawBody: string, signature?: string): WebhookSignatureVerification {
    const normalized = provider.trim().toUpperCase();

    if (normalized === 'PAYTOTA') {
      return this.verifyPaytota(rawBody, signature);
    }

    if (normalized === 'FLUTTERWAVE') {
      return this.verifyFlutterwave(rawBody, signature);
    }

    if (normalized === 'CORPORATEPAY') {
      return this.verifyCorporatePay(rawBody, signature);
    }

    return { valid: false };
  }

  private verifyPaytota(rawBody: string, signature?: string): WebhookSignatureVerification {
    const publicKey = this.config.get<string>('PAYTOTA_WEBHOOK_PUBLIC_KEY')?.trim();
    if (!publicKey || !signature) return { valid: false };
    return {
      valid: verifyRsaSignature(rawBody, signature, publicKey, 'sha256WithRSAEncryption'),
      fingerprint: publicKeyFingerprint(publicKey),
    };
  }

  private verifyFlutterwave(rawBody: string, signature?: string): WebhookSignatureVerification {
    const secret = this.config.get<string>('FLUTTERWAVE_WEBHOOK_SECRET')?.trim();
    if (!secret) return { valid: false };
    return { valid: verifyPayloadSignature(rawBody, signature, secret) };
  }

  private verifyCorporatePay(rawBody: string, signature?: string): WebhookSignatureVerification {
    const secret = this.config.get<string>('CORPORATEPAY_WEBHOOK_SECRET')?.trim();
    if (!secret) return { valid: false };
    return { valid: verifyPayloadSignature(rawBody, signature, secret) };
  }
}
