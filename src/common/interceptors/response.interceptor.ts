import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, map } from 'rxjs';
import { currentRequestId } from '../request-context';

@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<T, unknown> {
  intercept(_context: ExecutionContext, next: CallHandler<T>): Observable<unknown> {
    return next.handle().pipe(
      map((value: any) => {
        if (value?.success !== undefined) return value;
        if (value?.items && value?.meta) {
          return {
            success: true,
            data: value.items,
            meta: value.meta,
            requestId: currentRequestId(),
            timestamp: new Date().toISOString(),
          };
        }
        return {
          success: true,
          data: value,
          requestId: currentRequestId(),
          timestamp: new Date().toISOString(),
        };
      }),
    );
  }
}
