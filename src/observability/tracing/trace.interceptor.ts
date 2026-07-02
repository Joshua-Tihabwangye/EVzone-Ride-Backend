import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { SpanStatusCode, trace } from '@opentelemetry/api';
import type { Request, Response } from 'express';
import { Observable } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';

@Injectable()
export class TraceInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();
    const route = request.route?.path ?? request.url;
    const method = request.method;

    const tracer = trace.getTracer('evzone-ride');

    return tracer.startActiveSpan(`HTTP ${method} ${route}`, (span) => {
      span.setAttributes({
        'http.method': method,
        'http.route': route,
        'http.url': request.originalUrl,
        'http.target': request.url,
        'http.host': request.headers.host,
        'http.scheme': request.protocol,
        'http.client_ip': request.ip,
      });

      return next.handle().pipe(
        tap(() => {
          span.setAttribute('http.status_code', response.statusCode);
          if (response.statusCode >= 400) {
            span.setStatus({ code: SpanStatusCode.ERROR });
          } else {
            span.setStatus({ code: SpanStatusCode.OK });
          }
        }),
        catchError((error: unknown) => {
          const statusCode = (error as { status?: number }).status ?? 500;
          span.setAttribute('http.status_code', statusCode);
          span.setStatus({
            code: SpanStatusCode.ERROR,
            message: error instanceof Error ? error.message : String(error),
          });
          span.recordException(error instanceof Error ? error : new Error(String(error)));
          throw error;
        }),
        tap({
          finalize: () => span.end(),
        }),
      );
    });
  }
}
