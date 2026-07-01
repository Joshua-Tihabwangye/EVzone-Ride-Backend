import { SetMetadata } from '@nestjs/common';
import { Permission } from './permission.registry';

export const PERMISSIONS_KEY = 'permissions';

/**
 * Require the caller to have every listed permission. Platform administrators
 * and members whose effective permissions include '*' are always allowed.
 */
export const RequirePermission = (...permissions: Permission[]) => SetMetadata(PERMISSIONS_KEY, permissions);
