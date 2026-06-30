export type CorsOriginValue = string | string[] | true;

/**
 * Parse a comma-separated CORS origin configuration value.
 *
 * - `*` is allowed only in development/test.
 * - Staging/production require explicit, comma-separated URLs.
 * - Each non-wildcard entry is validated as a valid URL.
 *
 * The returned shape is compatible with NestJS CORS options and Socket.IO.
 */
export function parseCorsOrigins(
  raw: string | undefined,
  nodeEnv: string | undefined,
  label = 'CORS_ORIGINS',
): CorsOriginValue {
  const env = (nodeEnv ?? 'development').toLowerCase();
  const isNonLocal = env === 'staging' || env === 'production';
  const configured = (raw ?? '*').trim();

  if (configured === '*') {
    if (isNonLocal) {
      throw new Error(`${label} cannot be wildcard (*) in ${env}`);
    }
    return true;
  }

  const origins = configured
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  if (origins.length === 0) {
    throw new Error(`${label} must contain at least one origin`);
  }

  for (const origin of origins) {
    try {
      new URL(origin);
    } catch {
      throw new Error(`${label} contains invalid URL: ${origin}`);
    }
  }

  return origins;
}
