import { MockPaymentProvider } from '../src/payments/providers/mock-payment.provider';

describe('mock payment provider', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalAutoApprove = process.env.MOCK_PAYMENT_AUTO_APPROVE;

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    if (originalAutoApprove === undefined) delete process.env.MOCK_PAYMENT_AUTO_APPROVE;
    else process.env.MOCK_PAYMENT_AUTO_APPROVE = originalAutoApprove;
  });

  it('auto-approves in local development mode', async () => {
    process.env.NODE_ENV = 'development';
    process.env.MOCK_PAYMENT_AUTO_APPROVE = 'true';
    const result = await new MockPaymentProvider().verify({
      expectedAmount: 40_365,
      expectedCurrency: 'UGX',
      expectedReference: 'PAY-LOCAL',
    });
    expect(result.approved).toBe(true);
    expect(result.providerReference).toMatch(/^MOCK-/);
  });

  it('rejects an invalid production token', async () => {
    process.env.NODE_ENV = 'production';
    process.env.MOCK_PAYMENT_AUTO_APPROVE = 'false';
    const result = await new MockPaymentProvider().verify({
      providerToken: 'wrong-token',
      expectedAmount: 40_365,
      expectedCurrency: 'UGX',
      expectedReference: 'PAY-INVALID',
    });
    expect(result.approved).toBe(false);
    expect(result.status).toBe('failed');
  });

  it('rejects deterministic demo codes in production', async () => {
    process.env.NODE_ENV = 'production';
    process.env.MOCK_PAYMENT_AUTO_APPROVE = 'false';
    const result = await new MockPaymentProvider().verify({
      providerToken: '0365',
      expectedAmount: 40_365,
      expectedCurrency: 'UGX',
      expectedReference: 'PAY-AMOUNT-CODE',
    });
    expect(result.approved).toBe(false);
    expect(result.reason).toContain('not allowed in production');
  });
});
