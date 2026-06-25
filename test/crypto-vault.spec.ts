import {
  decryptSecret,
  encryptSecret,
  signPayload,
  verifyPayloadSignature,
} from '../src/common/utils/crypto-vault';

describe('integration crypto vault', () => {
  it('encrypts and decrypts integration credentials', () => {
    const original = { apiKey: 'school-secret', webhookSecret: 'hook-secret' };
    const encrypted = encryptSecret(original);

    expect(encrypted).not.toContain(original.apiKey);
    expect(decryptSecret(encrypted)).toEqual(original);
  });

  it('signs payloads and rejects altered payloads', () => {
    const payload = JSON.stringify({ id: 'evt-1', status: 'PAID' });
    const signature = signPayload(payload, 'integration-secret');

    expect(verifyPayloadSignature(payload, signature, 'integration-secret')).toBe(true);
    expect(verifyPayloadSignature(`${payload}x`, signature, 'integration-secret')).toBe(false);
  });
});
