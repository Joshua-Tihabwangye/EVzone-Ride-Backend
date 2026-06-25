import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('hex');
}

export function randomOtp(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function safeEqualHash(plain: string, expectedHash: string): boolean {
  const actual = Buffer.from(sha256(plain), 'hex');
  const expected = Buffer.from(expectedHash, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
