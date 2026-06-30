import * as Joi from 'joi';

/**
 * Regex matching obviously weak/default secret strings.
 * Keep in sync with ProductionConfigService secret checks.
 */
export const WEAK_SECRET_PATTERN = /local|docker|demo|example|change-in-production|secret-2026/i;

const truthyValues = new Set(['true', '1', 'yes', 'on']);

export function isTruthy(value: string | undefined): boolean {
  return truthyValues.has(value?.toLowerCase() ?? '');
}

const strongSecret = Joi.string().min(32).pattern(WEAK_SECRET_PATTERN, { invert: true }).messages({
  'string.min': '{#label} must be at least 32 characters',
  'string.pattern.invert.base': '{#label} appears to be a default or weak secret',
});

/**
 * Required, strong secret in staging/production; optional in development/test.
 */
const requiredSecretInProduction = Joi.string().when('NODE_ENV', {
  is: Joi.valid('staging', 'production'),
  then: strongSecret.required(),
  otherwise: Joi.string().allow(''),
});

/**
 * Joi validation schema for @nestjs/config.
 *
 * All values are kept as strings (convert: false) to remain compatible with the
 * existing codebase, which expects string booleans such as 'true'/'false'.
 */
export const validationSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'test', 'staging', 'production').default('development'),

  HOST: Joi.string().default('0.0.0.0'),
  PORT: Joi.string().default('3000'),
  PUBLIC_BASE_URL: Joi.string().uri().allow(''),
  API_PUBLIC_URL: Joi.string().uri().allow(''),

  DB_TYPE: Joi.string().valid('postgres').default('postgres'),
  DATABASE_URL: Joi.string().required(),
  DB_SYNCHRONIZE: Joi.string().valid('true', 'false', '1', '0', 'yes', 'no', '').default('false'),
  DB_MIGRATIONS_RUN: Joi.string().valid('true', 'false', '1', '0', 'yes', 'no', '').default('true'),
  DB_LOGGING: Joi.string().valid('true', 'false', '1', '0', 'yes', 'no', '').default('false'),

  CORS_ORIGINS: Joi.string().default('*'),
  SOCKET_CORS_ORIGINS: Joi.string().default(Joi.ref('CORS_ORIGINS')),

  JWT_SECRET: requiredSecretInProduction,
  INTEGRATION_ENCRYPTION_KEY: requiredSecretInProduction,
  CORPORATEPAY_WEBHOOK_SECRET: requiredSecretInProduction,
  CORPORATEPAY_SIGNING_SECRET: requiredSecretInProduction,
  SCHOOL_WEBHOOK_SECRET: requiredSecretInProduction,
  PAYTOTA_SECRET_KEY: requiredSecretInProduction,
  PAYTOTA_WEBHOOK_PUBLIC_KEY: requiredSecretInProduction,
  FLUTTERWAVE_WEBHOOK_SECRET: requiredSecretInProduction,
  FILE_SIGNATURE_SECRET: requiredSecretInProduction,
})
  .custom((value, helpers) => {
    const nodeEnv = (value.NODE_ENV ?? 'development').toLowerCase();
    if (nodeEnv !== 'staging' && nodeEnv !== 'production') {
      return value;
    }

    if ((value.CORS_ORIGINS ?? '').trim() === '*') {
      return helpers.error('cors.wildcard', { origin: 'CORS_ORIGINS' });
    }

    const socketOrigins = (value.SOCKET_CORS_ORIGINS ?? value.CORS_ORIGINS ?? '').trim();
    if (socketOrigins === '*') {
      return helpers.error('cors.wildcard', { origin: 'SOCKET_CORS_ORIGINS' });
    }

    if (isTruthy(value.DB_SYNCHRONIZE)) {
      return helpers.error('db.sync');
    }

    if (!isTruthy(value.DB_MIGRATIONS_RUN)) {
      return helpers.error('db.migrations');
    }

    return value;
  })
  .messages({
    'cors.wildcard': '{#origin} cannot be wildcard (*) in staging/production',
    'db.sync': 'DB_SYNCHRONIZE must be false in staging/production',
    'db.migrations': 'DB_MIGRATIONS_RUN must be true in staging/production',
  });

export const validationOptions: Joi.ValidationOptions = {
  abortEarly: false,
  allowUnknown: true,
  convert: false,
};
