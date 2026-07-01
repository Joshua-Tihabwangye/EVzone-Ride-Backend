export interface TracingConfig {
  enabled: boolean;
  serviceName: string;
  serviceVersion: string;
  environment: string;
  otlpEndpoint?: string;
  otlpProtocol: 'http/protobuf' | 'grpc';
  sampleRate: number;
  logLevel: 'NONE' | 'ERROR' | 'WARN' | 'INFO' | 'DEBUG' | 'VERBOSE';
}

function parseSampleRate(value: string | undefined): number {
  const parsed = Number(value ?? '1');
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) return 1;
  return parsed;
}

export function buildTracingConfig(): TracingConfig {
  const enabled = ['true', '1', 'yes', 'on'].includes((process.env.OTEL_ENABLED ?? 'false').toLowerCase());
  return {
    enabled,
    serviceName: process.env.OTEL_SERVICE_NAME ?? 'evzone-ride',
    serviceVersion: process.env.OTEL_SERVICE_VERSION ?? process.env.npm_package_version ?? '1.0.0',
    environment: process.env.OTEL_ENVIRONMENT ?? process.env.NODE_ENV ?? 'development',
    otlpEndpoint: process.env.OTEL_EXPORTER_OTLP_ENDPOINT,
    otlpProtocol:
      (process.env.OTEL_EXPORTER_OTLP_PROTOCOL as TracingConfig['otlpProtocol']) ?? 'http/protobuf',
    sampleRate: parseSampleRate(process.env.OTEL_SAMPLE_RATE),
    logLevel: (process.env.OTEL_LOG_LEVEL as TracingConfig['logLevel']) ?? 'NONE',
  };
}
