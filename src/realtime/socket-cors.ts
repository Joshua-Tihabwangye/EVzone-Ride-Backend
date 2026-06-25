export function socketCorsOptions() {
  const configured = process.env.SOCKET_CORS_ORIGINS ?? process.env.CORS_ORIGINS ?? '*';
  const origin =
    configured.trim() === '*'
      ? true
      : configured
          .split(',')
          .map((value) => value.trim())
          .filter(Boolean);
  return { origin, credentials: true };
}
