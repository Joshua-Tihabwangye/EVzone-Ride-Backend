export interface PaymentVerificationInput {
  providerToken?: string;
  expectedAmount: number;
  expectedCurrency: string;
  expectedReference: string;
}

export interface PaymentVerificationResult {
  approved: boolean;
  providerReference?: string;
  status: string;
  response?: Record<string, unknown>;
  reason?: string;
}

export interface PaymentProviderAdapter {
  readonly name: string;
  verify(input: PaymentVerificationInput): Promise<PaymentVerificationResult>;
  status(): Record<string, unknown>;
}
