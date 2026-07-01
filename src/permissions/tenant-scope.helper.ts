import { FindOptionsWhere, ObjectLiteral, SelectQueryBuilder } from 'typeorm';

/**
 * Helpers for applying tenant scoping to TypeORM queries. Platform admins
 * (isPlatformAdmin === true) and queries without an organizationId are left
 * unscoped so callers can enforce the absence of a tenant context themselves.
 */
export class TenantScopeHelper {
  static applyTenantScope<T extends ObjectLiteral>(
    qb: SelectQueryBuilder<T>,
    alias: string,
    organizationId?: string,
    isPlatformAdmin = false,
  ): SelectQueryBuilder<T> {
    if (isPlatformAdmin || !organizationId) return qb;
    return qb.andWhere(`${alias}.organizationId = :organizationId`, { organizationId });
  }

  static withOrganizationId<T>(
    where: FindOptionsWhere<T>,
    organizationId?: string,
    isPlatformAdmin = false,
  ): FindOptionsWhere<T> {
    if (isPlatformAdmin || !organizationId) return where;
    return { ...where, organizationId } as FindOptionsWhere<T>;
  }
}
