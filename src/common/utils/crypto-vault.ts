import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  createPublicKey,
  randomBytes,
  timingSafeEqual,
  verify,
} from 'node:crypto';
import { getRequiredSecret } from './required-secret.util';

function key(): Buffer {
  const source = getRequiredSecret(
    'INTEGRATION_ENCRYPTION_KEY',
    process.env.INTEGRATION_ENCRYPTION_KEY ?? process.env.JWT_SECRET,
    process.env.NODE_ENV,
    { allowLocalFallback: true, localFallback: 'evzone-local-integration-key' },
  );
  return createHash('sha256').update(source).digest();
}

export function encryptSecret(value: Record<string, unknown>): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64url')}.${tag.toString('base64url')}.${encrypted.toString('base64url')}`;
}

export function decryptSecret(value?: string): Record<string, unknown> {
  if (!value) return {};
  const [ivEncoded, tagEncoded, payloadEncoded] = value.split('.');
  if (!ivEncoded || !tagEncoded || !payloadEncoded) return {};
  const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(ivEncoded, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagEncoded, 'base64url'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(payloadEncoded, 'base64url')),
    decipher.final(),
  ]);
  return JSON.parse(decrypted.toString('utf8')) as Record<string, unknown>;
}

export function signPayload(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('hex');
}

export function verifyPayloadSignature(
  payload: string,
  signature: string | undefined,
  secret: string,
): boolean {
  if (!signature) return false;
  const expected = Buffer.from(signPayload(payload, secret));
  const supplied = Buffer.from(signature.replace(/^sha256=/, ''));
  return expected.length === supplied.length && timingSafeEqual(expected, supplied);
}

/**
 * Verifies an RSA PKCS#1 v1.5 signature (base64) of a SHA256 digest.
 * Accepts PEM, DER, or X.509 certificate public keys.
 */
export function verifyRsaSignature(
  payload: string | Buffer,
  signatureBase64: string,
  publicKeyPem: string,
  algorithm = 'sha256WithRSAEncryption',
): boolean {
  try {
    const publicKey = createPublicKey(publicKeyPem);
    const data = typeof payload === 'string' ? Buffer.from(payload, 'utf8') : payload;
    return verify(algorithm, data, publicKey, Buffer.from(signatureBase64, 'base64'));
  } catch {
    return false;
  }
}

export function publicKeyFingerprint(publicKeyPem: string): string | undefined {
  try {
    const publicKey = createPublicKey(publicKeyPem);
    return createHash('sha256')
      .update(publicKey.export({ type: 'spki', format: 'der' }))
      .digest('base64url');
  } catch {
    return undefined;
  }
}
