import { AuthService } from '../src/auth/auth.service';
import { UserRole } from '../src/common/enums';
import { AccessTokenClaims } from '../src/auth/access-token-verifier.service';

type AuthServiceClaimProbe = {
  externalRoles(claims: AccessTokenClaims): string[];
  externalUserRole(claims: AccessTokenClaims): UserRole;
  externalOrganizations(claims: AccessTokenClaims): Array<{ id: string; name: string; role?: string }>;
  preferredExternalOrganizationId(claims: AccessTokenClaims): string | undefined;
};

describe('Fleet OIDC claim compatibility', () => {
  const probe = Object.create(AuthService.prototype) as AuthServiceClaimProbe;

  it('understands Fleet Partner role claim variants used by the web app', () => {
    const claims = {
      sub: 'oidc-user',
      'evzone.principal': { roles: ['fleet_dispatcher'] },
      resource_access: { fleet: { roles: ['dispatch:view'] } },
    } as AccessTokenClaims;

    expect(probe.externalRoles(claims)).toEqual(
      expect.arrayContaining(['fleet_dispatcher', 'dispatch:view']),
    );
    expect(probe.externalUserRole(claims)).toBe(UserRole.DISPATCHER);
  });

  it('parses underscored organization claims and a selected organization', () => {
    const claims = {
      sub: 'oidc-user',
      evzone_organizations: [
        { organizationId: 'org-a', displayName: 'Fleet A', membershipRole: 'fleet_manager' },
        { tenant_id: 'org-b', tenantName: 'Fleet B', membership_role: 'fleet_finance' },
      ],
      selected_organization_id: 'org-b',
    } as AccessTokenClaims;

    expect(probe.externalOrganizations(claims)).toEqual([
      { id: 'org-a', name: 'Fleet A', role: 'fleet_manager' },
      { id: 'org-b', name: 'Fleet B', role: 'fleet_finance' },
    ]);
    expect(probe.preferredExternalOrganizationId(claims)).toBe('org-b');
  });

  it('parses JSON-encoded principal role claims', () => {
    const claims = {
      sub: 'oidc-user',
      evzone_principal: JSON.stringify({ roles: ['fleet_owner'] }),
    } as AccessTokenClaims;
    expect(probe.externalUserRole(claims)).toBe(UserRole.FLEET_PARTNER);
  });
});
