import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

function normalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => normalize(item));
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, item]) => item !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, normalize(item)]),
    );
  }
  if (value instanceof Date) return value.toISOString();
  return value;
}

export function canonicalJson(value: unknown): string {
  if (value === undefined || value === null) return '';
  return JSON.stringify(normalize(value));
}

export function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export interface CorporatePaySignatureInput {
  timestamp: string;
  nonce: string;
  method: string;
  path: string;
  body?: unknown;
}

export function corporatePaySigningPayload(input: CorporatePaySignatureInput): string {
  return [
    input.timestamp,
    input.nonce,
    input.method.toUpperCase(),
    input.path,
    sha256Hex(canonicalJson(input.body)),
  ].join('\n');
}

export function signCorporatePayRequest(input: CorporatePaySignatureInput, secret: string): string {
  return createHmac('sha256', secret).update(corporatePaySigningPayload(input)).digest('hex');
}

export function verifyCorporatePayRequest(
  input: CorporatePaySignatureInput,
  suppliedSignature: string | undefined,
  secret: string,
): boolean {
  if (!suppliedSignature) return false;
  const candidate = suppliedSignature
    .replace(/^sha256=/i, '')
    .trim()
    .toLowerCase();
  const expected = signCorporatePayRequest(input, secret);
  if (!/^[a-f0-9]{64}$/.test(candidate)) return false;
  return timingSafeEqual(Buffer.from(candidate, 'hex'), Buffer.from(expected, 'hex'));
}
