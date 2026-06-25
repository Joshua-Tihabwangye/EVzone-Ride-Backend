import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Request } from 'express';
import { Observable, tap } from 'rxjs';
import { Repository } from 'typeorm';
import { AuditLog } from '../../database/entities';
import { AuthUser } from '../interfaces';
import { currentRequestId } from '../request-context';

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(@InjectRepository(AuditLog) private readonly auditRepository: Repository<AuditLog>) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();
    const request = context.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)) return next.handle();
    const started = Date.now();
    return next.handle().pipe(
      tap((result: any) => {
        const entityId = result?.id ?? result?.data?.id;
        void this.auditRepository
          .save(
            this.auditRepository.create({
              actorUserId: request.user?.id,
              action: request.method,
              entityType: request.route?.path ?? request.path,
              entityId,
              route: request.originalUrl,
              ipAddress: request.ip,
              data: { durationMs: Date.now() - started, requestId: currentRequestId() },
            }),
          )
          .catch(() => undefined);
      }),
    );
  }
}
