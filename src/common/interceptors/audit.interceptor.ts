import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import { Request } from 'express';
import { Observable, tap } from 'rxjs';
import { AuditService } from '../../audit/audit.service';
import { AuthUser } from '../interfaces';
import { currentRequestId } from '../request-context';

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditInterceptor.name);

  constructor(private readonly auditService: AuditService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();
    const request = context.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)) return next.handle();

    return next.handle().pipe(
      tap((result: unknown) => {
        const entityId =
          (result && typeof result === 'object' && 'id' in result ? (result as { id: string }).id : undefined) ??
          (result && typeof result === 'object' && 'data' in result
            ? ((result as { data?: { id?: string } }).data?.id ?? undefined)
            : undefined);

        void this.auditService
          .record({
            actorUserId: request.user?.id,
            action: `${request.method} ${request.route?.path ?? request.path}`,
            entityType: request.route?.path ?? request.path,
            entityId,
            route: request.originalUrl,
            ipAddress: request.ip ?? undefined,
            requestId: currentRequestId(),
            after: result && typeof result === 'object' ? (result as Record<string, unknown>) : undefined,
            metadata: { source: 'AuditInterceptor' },
          })
          .catch((error) => {
            this.logger.error(
              `Failed to write audit log for ${request.method} ${request.originalUrl}: ${error instanceof Error ? error.message : String(error)}`,
            );
          });
      }),
    );
  }
}
