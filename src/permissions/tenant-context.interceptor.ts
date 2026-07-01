import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { AuthUser } from '../common/interfaces';
import { PermissionsService } from './permissions.service';

export const ACTIVE_ORGANIZATION_HEADER = 'x-organization-id';

@Injectable()
export class TenantContextInterceptor implements NestInterceptor {
  constructor(private readonly permissionsService: PermissionsService) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    const request = context
      .switchToHttp()
      .getRequest<{ headers: Record<string, string | undefined>; user?: AuthUser }>();
    const user = request.user;
    if (!user) return next.handle();

    const requestedOrganizationId = request.headers[ACTIVE_ORGANIZATION_HEADER];
    const ctx = await this.permissionsService.resolveContext(user, requestedOrganizationId);

    user.activeOrganizationId = ctx.activeOrganizationId;
    user.permissions = ctx.permissions;
    user.isPlatformAdmin = ctx.isPlatformAdmin;

    return next.handle();
  }
}
