import { Logger } from '@nestjs/common';

/**
 * Regex matching obviously weak/default secret strings.
 * Keep in sync with src/config/env.validation.ts.
 */
export const WEAK_SECRET_PATTERN = /local|docker|demo|example|change-in-production|secret-2026/i;

export interface RequiredSecretOptions {
  /** Allow a configured fallback value when the secret is missing in development/test. */
  allowLocalFallback?: boolean;
  /** Fallback value used only in development/test when allowLocalFallback is true. */
  localFallback?: string;
  /** Minimum secret length. Defaults to 32. */
  minLength?: number;
}

/**
 * Returns a required secret value, failing closed in staging/production and
 * warning (but allowing development fallbacks) in development/test.
 */
export function getRequiredSecret(
  key: string,
  raw: string | undefined,
  nodeEnv: string | undefined,
  options: RequiredSecretOptions = {},
): string {
  const env = (nodeEnv ?? 'development').toLowerCase();
  const isNonLocal = env === 'staging' || env === 'production';
  const minLength = options.minLength ?? 32;

  if (!raw) {
    if (isNonLocal || !options.allowLocalFallback || options.localFallback === undefined) {
      throw new Error(`${key} is required`);
    }
    Logger.warn(`${key} is unset; using configured local fallback (development only)`, 'RequiredSecret');
    return validateWeakness(key, options.localFallback, env, minLength, true);
  }

  return validateWeakness(key, raw.trim(), env, minLength, false);
}

function validateWeakness(
  key: string,
  value: string,
  env: string,
  minLength: number,
  isFallback: boolean,
): string {
  const isNonLocal = env === 'staging' || env === 'production';
  const weak = value.length < minLength || WEAK_SECRET_PATTERN.test(value);

  if (weak) {
    const message = `${key} is weak/default (${isFallback ? 'fallback' : 'configured'} value)`;
    if (isNonLocal) {
      throw new Error(
        `${message}; must be a strong secret (>= ${minLength} chars, not default/weak) in ${env}`,
      );
    }
    Logger.warn(`${message}; accepted in ${env} only`, 'RequiredSecret');
  }

  return value;
}
