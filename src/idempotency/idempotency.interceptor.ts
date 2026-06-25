import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Observable, catchError, from, mergeMap, of } from 'rxjs';
import { AuthUser } from '../common/interfaces';
import { IdempotencyService } from './idempotency.service';

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(private readonly idempotency: IdempotencyService) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    if (context.getType() !== 'http') return next.handle();
    const request = context.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const response = context.switchToHttp().getResponse<Response>();
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)) return next.handle();

    const header = request.headers['idempotency-key'];
    const key = Array.isArray(header) ? header[0] : header;
    if (!key?.trim()) return next.handle();

    const scope = `${request.method}:${request.originalUrl.split('?')[0]}`;
    const result = await this.idempotency.begin({
      key,
      scope,
      userId: request.user?.id,
      requestBody: request.body,
      ttlSeconds: Number(process.env.IDEMPOTENCY_TTL_SECONDS ?? 86400),
    });

    response.setHeader('idempotency-key', key);
    if (result.replay) {
      response.setHeader('idempotency-replayed', 'true');
      if (result.record.responseStatus) response.status(result.record.responseStatus);
      return of(result.record.responseBody);
    }

    return next.handle().pipe(
      mergeMap((value) =>
        from(this.idempotency.complete(result.record.id, value, response.statusCode).then(() => value)),
      ),
      catchError((error: unknown) =>
        from(
          this.idempotency.fail(result.record.id).then(() => {
            throw error;
          }),
        ),
      ),
    );
  }
}
