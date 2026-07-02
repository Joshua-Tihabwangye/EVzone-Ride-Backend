import { diag, DiagConsoleLogger, DiagLogLevel } from '@opentelemetry/api';
import { W3CTraceContextPropagator } from '@opentelemetry/core';
import { ExpressInstrumentation } from '@opentelemetry/instrumentation-express';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { IORedisInstrumentation } from '@opentelemetry/instrumentation-ioredis';
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { KafkaJsInstrumentation } from '@opentelemetry/instrumentation-kafkajs';
import { NestInstrumentation } from '@opentelemetry/instrumentation-nestjs-core';
import { PgInstrumentation } from '@opentelemetry/instrumentation-pg';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { TraceIdRatioBasedSampler } from '@opentelemetry/sdk-trace-base';
import { OTLPTraceExporter as OTLPTraceExporterGrpc } from '@opentelemetry/exporter-trace-otlp-grpc';
import { OTLPTraceExporter as OTLPTraceExporterHttp } from '@opentelemetry/exporter-trace-otlp-http';
import {
  SEMRESATTRS_DEPLOYMENT_ENVIRONMENT,
  SEMRESATTRS_SERVICE_NAME,
  SEMRESATTRS_SERVICE_VERSION,
} from '@opentelemetry/semantic-conventions';
import type { TracingConfig } from './tracing.config';

const logLevelMap: Record<TracingConfig['logLevel'], DiagLogLevel> = {
  NONE: DiagLogLevel.NONE,
  ERROR: DiagLogLevel.ERROR,
  WARN: DiagLogLevel.WARN,
  INFO: DiagLogLevel.INFO,
  DEBUG: DiagLogLevel.DEBUG,
  VERBOSE: DiagLogLevel.VERBOSE,
};

export class TracingProvider {
  private sdk?: NodeSDK;

  init(config: TracingConfig): void {
    if (!config.enabled) return;

    if (config.logLevel !== 'NONE') {
      diag.setLogger(new DiagConsoleLogger(), logLevelMap[config.logLevel]);
    }

    const resource = resourceFromAttributes({
      [SEMRESATTRS_SERVICE_NAME]: config.serviceName,
      [SEMRESATTRS_SERVICE_VERSION]: config.serviceVersion,
      [SEMRESATTRS_DEPLOYMENT_ENVIRONMENT]: config.environment,
    });

    const Exporter = config.otlpProtocol === 'grpc' ? OTLPTraceExporterGrpc : OTLPTraceExporterHttp;
    const exporter = new Exporter({ url: config.otlpEndpoint });

    // Keep the list in a variable so the NodeSDK does not treat the array as
    // a nested metrics/logs configuration.
    const instrumentations = [
      new HttpInstrumentation(),
      new ExpressInstrumentation(),
      new NestInstrumentation(),
      new PgInstrumentation(),
      new IORedisInstrumentation(),
      new KafkaJsInstrumentation(),
    ];

    this.sdk = new NodeSDK({
      resource,
      traceExporter: exporter,
      textMapPropagator: new W3CTraceContextPropagator(),
      sampler: new TraceIdRatioBasedSampler(config.sampleRate),
      instrumentations,
    });

    this.sdk.start();
  }

  async shutdown(): Promise<void> {
    await this.sdk?.shutdown();
  }
}

export const tracingProvider = new TracingProvider();
