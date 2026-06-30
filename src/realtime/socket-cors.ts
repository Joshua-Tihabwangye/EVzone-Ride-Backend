import { parseCorsOrigins } from '../common/utils/cors-origins.helper';

export function socketCorsOptions() {
  const origin = parseCorsOrigins(
    process.env.SOCKET_CORS_ORIGINS ?? process.env.CORS_ORIGINS,
    process.env.NODE_ENV,
    'SOCKET_CORS_ORIGINS',
  );
  return { origin, credentials: true };
}
