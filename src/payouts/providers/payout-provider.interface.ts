export interface PayoutDestination {
  type?: string;
  phone?: string;
  accountNumber?: string;
  bankCode?: string;
  bankName?: string;
  accountName?: string;
  country?: string;
  currency?: string;
}

export interface PayoutRequest {
  reference: string;
  idempotencyKey: string;
  amount: number;
  currency: string;
  destination: PayoutDestination;
  narration?: string;
  metadata?: Record<string, unknown>;
}

export type PayoutProviderState = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled' | 'unknown';

export interface PayoutInitiationResult {
  status: PayoutProviderState;
  providerReference?: string;
  providerBatchId?: string;
  fee?: number;
  providerPayload?: Record<string, unknown>;
  providerError?: Record<string, unknown>;
}

export interface PayoutVerificationResult {
  status: PayoutProviderState;
  providerReference?: string;
  amount?: number;
  currency?: string;
  settledAt?: Date;
  failureReason?: string;
  providerPayload?: Record<string, unknown>;
}

export interface PayoutWebhookVerification {
  valid: boolean;
  reference?: string;
  status?: PayoutProviderState;
  payload?: Record<string, unknown>;
  reason?: string;
}

export interface PayoutProviderAdapter {
  readonly name: string;
  initiate(request: PayoutRequest): Promise<PayoutInitiationResult>;
  verify(reference: string): Promise<PayoutVerificationResult>;
  cancel(reference: string): Promise<boolean>;
  verifyWebhook?(payload: unknown, signature: string): PayoutWebhookVerification;
  status(): Record<string, unknown>;
}
