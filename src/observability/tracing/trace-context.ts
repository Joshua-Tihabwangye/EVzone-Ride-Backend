import { context, propagation, trace } from '@opentelemetry/api';
import { W3CTraceContextPropagator } from '@opentelemetry/core';

export function getActiveTraceId(): string | undefined {
  return trace.getActiveSpan()?.spanContext().traceId;
}

export function getActiveSpanId(): string | undefined {
  return trace.getActiveSpan()?.spanContext().spanId;
}

export function injectTraceparentIntoHeaders(headers: Record<string, string | string[] | undefined>): void {
  const propagator = new W3CTraceContextPropagator();
  propagator.inject(context.active(), headers, {
    set(carrier, key, value) {
      carrier[key] = value;
    },
  });
}

export function extractTraceparentFromHeaders(headers: Record<string, string | string[] | undefined>): {
  traceId?: string;
  spanId?: string;
} {
  const propagator = new W3CTraceContextPropagator();
  const getter = {
    keys(carrier: Record<string, string | string[] | undefined>): string[] {
      return Object.keys(carrier);
    },
    get(carrier: Record<string, string | string[] | undefined>, key: string): string | string[] | undefined {
      return carrier[key.toLowerCase()] ?? carrier[key];
    },
  };
  const ctx = propagator.extract(context.active(), headers, getter);
  const spanContext = trace.getSpanContext(ctx);
  if (!spanContext) return {};
  return { traceId: spanContext.traceId, spanId: spanContext.spanId };
}
