import { Counter, Gauge, Histogram, register } from 'prom-client';

function getOrCreateCounter(name: string, help: string, labelNames: string[] = []): Counter {
  const existing = register.getSingleMetric(name) as Counter | undefined;
  return existing ?? new Counter({ name, help, labelNames });
}

function getOrCreateHistogram(
  name: string,
  help: string,
  labelNames: string[] = [],
  buckets?: number[],
): Histogram {
  const existing = register.getSingleMetric(name) as Histogram | undefined;
  return existing ?? new Histogram({ name, help, labelNames, buckets });
}

function getOrCreateGauge(name: string, help: string, labelNames: string[] = []): Gauge {
  const existing = register.getSingleMetric(name) as Gauge | undefined;
  return existing ?? new Gauge({ name, help, labelNames });
}

function labelValues(labels: Record<string, string | undefined>): Record<string, string> | undefined {
  const entries = Object.entries(labels).filter(([, value]) => value !== undefined);
  return entries.length ? Object.fromEntries(entries as [string, string][]) : undefined;
}

export function IncrementCounter(
  name: string,
  help: string,
  labels?: Record<string, string | undefined>,
): MethodDecorator {
  return function (target: object, propertyKey: string | symbol, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value as (...args: unknown[]) => unknown;
    if (!originalMethod) return descriptor;

    const labelNames = labels ? Object.keys(labels) : [];
    const counter = getOrCreateCounter(name, help, labelNames);
    const resolvedLabels = labelValues(labels ?? {});

    descriptor.value = function (this: unknown, ...args: unknown[]): unknown {
      const result = originalMethod.apply(this, args);
      if (result instanceof Promise) {
        return result.then((value) => {
          counter.inc(resolvedLabels ?? {});
          return value;
        });
      }
      counter.inc(resolvedLabels ?? {});
      return result;
    };

    return descriptor;
  };
}

export function RecordHistogram(
  name: string,
  help: string,
  buckets?: number[],
  labels?: Record<string, string | undefined>,
): MethodDecorator {
  return function (target: object, propertyKey: string | symbol, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value as (...args: unknown[]) => unknown;
    if (!originalMethod) return descriptor;

    const labelNames = labels ? Object.keys(labels) : [];
    const histogram = getOrCreateHistogram(name, help, labelNames, buckets);
    const resolvedLabels = labelValues(labels ?? {});

    descriptor.value = function (this: unknown, ...args: unknown[]): unknown {
      const start = process.hrtime.bigint();
      const result = originalMethod.apply(this, args);
      const observe = () => {
        const duration = Number(process.hrtime.bigint() - start) / 1e9;
        histogram.observe(resolvedLabels ?? {}, duration);
      };
      if (result instanceof Promise) {
        return result.then((value) => {
          observe();
          return value;
        });
      }
      observe();
      return result;
    };

    return descriptor;
  };
}

export function ObserveGauge(
  name: string,
  help: string,
  value: number,
  labels?: Record<string, string | undefined>,
): MethodDecorator {
  return function (target: object, propertyKey: string | symbol, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value as (...args: unknown[]) => unknown;
    if (!originalMethod) return descriptor;

    const labelNames = labels ? Object.keys(labels) : [];
    const gauge = getOrCreateGauge(name, help, labelNames);
    const resolvedLabels = labelValues(labels ?? {});

    descriptor.value = function (this: unknown, ...args: unknown[]): unknown {
      gauge.set(resolvedLabels ?? {}, value);
      return originalMethod.apply(this, args);
    };

    return descriptor;
  };
}
