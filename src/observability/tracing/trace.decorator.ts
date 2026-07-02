import { SpanStatusCode, trace } from '@opentelemetry/api';

export interface WithSpanOptions {
  name?: string;
  attributes?: Record<string, unknown>;
}

export function WithSpan(options: WithSpanOptions = {}): MethodDecorator {
  return function (target: object, propertyKey: string | symbol, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value as (...args: unknown[]) => unknown;
    if (!originalMethod) return descriptor;

    const spanName = options.name ?? `${target.constructor.name}.${String(propertyKey)}`;

    descriptor.value = function (this: unknown, ...args: unknown[]): unknown {
      const tracer = trace.getTracer('evzone-ride');
      const run = async (): Promise<unknown> => {
        const result = await originalMethod.apply(this, args);
        return result;
      };

      return tracer.startActiveSpan(spanName, (span) => {
        if (options.attributes) {
          Object.entries(options.attributes).forEach(([key, value]) =>
            span.setAttribute(key, value as never),
          );
        }

        try {
          const result = run();
          if (result instanceof Promise) {
            return result
              .then((value) => {
                span.setStatus({ code: SpanStatusCode.OK });
                return value;
              })
              .catch((error: unknown) => {
                recordError(span, error);
                throw error;
              })
              .finally(() => span.end());
          }
          span.setStatus({ code: SpanStatusCode.OK });
          span.end();
          return result;
        } catch (error: unknown) {
          recordError(span, error);
          span.end();
          throw error;
        }
      });
    };

    return descriptor;
  };
}

function recordError(span: ReturnType<typeof trace.getActiveSpan> | undefined, error: unknown): void {
  if (!span) return;
  const message = error instanceof Error ? error.message : String(error);
  span.setStatus({ code: SpanStatusCode.ERROR, message });
  span.recordException(error instanceof Error ? error : new Error(message));
}
