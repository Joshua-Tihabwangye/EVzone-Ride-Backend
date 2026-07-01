import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '../common/enums';
import { AuthUser } from '../common/interfaces';
import { ALL_PERMISSIONS_WILDCARD, Permission } from './permission.registry';
import { PERMISSIONS_KEY } from './require-permission.decorator';

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Permission[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required?.length) return true;

    const request = context.switchToHttp().getRequest<{ user?: AuthUser }>();
    const user = request.user;
    if (!user) throw new ForbiddenException('Authentication required');

    if (user.role === UserRole.ADMIN || user.isPlatformAdmin) return true;

    if (!user.activeOrganizationId) {
      throw new ForbiddenException('No active organization selected');
    }

    if (!user.permissions?.length) {
      throw new ForbiddenException('Insufficient permissions');
    }

    if (user.permissions.includes(ALL_PERMISSIONS_WILDCARD)) return true;

    for (const permission of required) {
      if (!user.permissions.includes(permission)) {
        throw new ForbiddenException(`Missing permission: ${permission}`);
      }
    }

    return true;
  }
}
