import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';

function key(): Buffer {
  const source =
    process.env.INTEGRATION_ENCRYPTION_KEY ?? process.env.JWT_SECRET ?? 'evzone-local-integration-key';
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
