import {
  canonicalJson,
  corporatePaySigningPayload,
  signCorporatePayRequest,
  verifyCorporatePayRequest,
} from '../src/corporate-integration/corporate-partner-signature';

describe('CorporatePay partner request signatures', () => {
  it('canonicalizes nested JSON deterministically', () => {
    expect(canonicalJson({ z: 1, a: { y: 2, x: 3 }, list: [{ b: 2, a: 1 }] })).toBe(
      '{"a":{"x":3,"y":2},"list":[{"a":1,"b":2}],"z":1}',
    );
  });

  it('signs method, path, timestamp, nonce and body hash', () => {
    const input = {
      timestamp: '1782043200',
      nonce: '4cb85707-6540-4af0-95fe-08ab93b22fc0',
      method: 'POST',
      path: '/api/v1/corporate-pay/partner/quotes',
      body: { serviceType: 'RIDE', amount: 1000 },
    };
    const signature = signCorporatePayRequest(input, 'integration-secret');
    expect(signature).toMatch(/^[a-f0-9]{64}$/);
    expect(corporatePaySigningPayload(input)).toContain('/api/v1/corporate-pay/partner/quotes');
    expect(verifyCorporatePayRequest(input, `sha256=${signature}`, 'integration-secret')).toBe(true);
    expect(verifyCorporatePayRequest({ ...input, method: 'PATCH' }, signature, 'integration-secret')).toBe(
      false,
    );
  });
});
