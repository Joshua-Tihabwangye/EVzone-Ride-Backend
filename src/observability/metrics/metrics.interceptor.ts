import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Observable } from 'rxjs';
import { finalize } from 'rxjs/operators';
import { BusinessMetricsService } from './business-metrics.service';

@Injectable()
export class MetricsInterceptor implements NestInterceptor {
  constructor(private readonly businessMetrics: BusinessMetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();
    const method = request.method;
    const route = request.route?.path ?? 'unknown';
    const start = process.hrtime.bigint();

    return next.handle().pipe(
      finalize(() => {
        const duration = Number(process.hrtime.bigint() - start) / 1e9;
        this.businessMetrics.recordHttpRequest(method, route, response.statusCode, duration);
      }),
    );
  }
}
