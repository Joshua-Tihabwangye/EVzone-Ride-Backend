import { OrganizationMemberRole } from '../common/enums';

export const ALL_PERMISSIONS_WILDCARD = '*' as const;

export const Permission = {
  // Organization management
  ORGANIZATION_READ: 'organization:read',
  ORGANIZATION_UPDATE: 'organization:update',

  // Fleet portal
  FLEET_READ: 'fleet:read',
  FLEET_DRIVER_WRITE: 'fleet:driver:write',
  FLEET_VEHICLE_WRITE: 'fleet:vehicle:write',
  FLEET_DISPATCH_WRITE: 'fleet:dispatch:write',

  // Agent portal
  AGENT_READ: 'agent:read',
  AGENT_CASE_WRITE: 'agent:case:write',
  AGENT_MANUAL_BOOKING_WRITE: 'agent:manual-booking:write',
  AGENT_DRIVER_ASSIGN: 'agent:driver:assign',

  // Dispatch / universal dispatch
  DISPATCH_READ: 'dispatch:read',
  DISPATCH_MANUAL_BOOKING_CREATE: 'dispatch:manual-booking:create',
  DISPATCH_DRIVER_ASSIGN: 'dispatch:driver:assign',
  DISPATCH_MATCH_RUN: 'dispatch:match:run',
  DISPATCH_POLICY_WRITE: 'dispatch:policy:write',

  // Finance
  FINANCE_CASHOUT_READ: 'finance:cashout:read',
  FINANCE_CASHOUT_REVIEW: 'finance:cashout:review',
  FINANCE_PAYOUT_READ: 'finance:payout:read',
  FINANCE_PAYOUT_RETRY: 'finance:payout:retry',
  FINANCE_REFUND_CREATE: 'finance:refund:create',
  FINANCE_REVENUE_READ: 'finance:revenue:read',
  FINANCE_SETTLEMENT_WRITE: 'finance:settlement:write',

  // Governance
  GOVERNANCE_FLAG_WRITE: 'governance:flag:write',
  GOVERNANCE_CONFIG_WRITE: 'governance:config:write',
  GOVERNANCE_APPROVAL_DECIDE: 'governance:approval:decide',
  GOVERNANCE_RISK_CASE_WRITE: 'governance:risk-case:write',
  GOVERNANCE_ALERT_ACKNOWLEDGE: 'governance:alert:acknowledge',

  // Platform admin
  ADMIN_USER_READ: 'admin:user:read',
  ADMIN_USER_SUSPEND: 'admin:user:suspend',
  ADMIN_ORGANIZATION_REVIEW: 'admin:organization:review',
  ADMIN_COMMISSION_RULE_WRITE: 'admin:commission-rule:write',
} as const;

export type Permission = (typeof Permission)[keyof typeof Permission] | typeof ALL_PERMISSIONS_WILDCARD;

/**
 * Default permission grants for each organization role. Explicit permissions
 * stored on OrganizationMember.permissions are merged on top of these defaults.
 */
export const ORGANIZATION_ROLE_PERMISSIONS: Record<OrganizationMemberRole, Permission[]> = {
  [OrganizationMemberRole.OWNER]: [ALL_PERMISSIONS_WILDCARD],
  [OrganizationMemberRole.ADMIN]: [
    Permission.ORGANIZATION_READ,
    Permission.ORGANIZATION_UPDATE,
    Permission.FLEET_READ,
    Permission.FLEET_DRIVER_WRITE,
    Permission.FLEET_VEHICLE_WRITE,
    Permission.FLEET_DISPATCH_WRITE,
    Permission.AGENT_READ,
    Permission.AGENT_CASE_WRITE,
    Permission.AGENT_MANUAL_BOOKING_WRITE,
    Permission.AGENT_DRIVER_ASSIGN,
    Permission.DISPATCH_READ,
    Permission.DISPATCH_MANUAL_BOOKING_CREATE,
    Permission.DISPATCH_DRIVER_ASSIGN,
    Permission.DISPATCH_POLICY_WRITE,
    Permission.FINANCE_CASHOUT_READ,
    Permission.FINANCE_CASHOUT_REVIEW,
    Permission.FINANCE_PAYOUT_READ,
    Permission.FINANCE_REFUND_CREATE,
    Permission.FINANCE_REVENUE_READ,
    Permission.FINANCE_SETTLEMENT_WRITE,
    Permission.GOVERNANCE_ALERT_ACKNOWLEDGE,
  ],
  [OrganizationMemberRole.FLEET_MANAGER]: [
    Permission.ORGANIZATION_READ,
    Permission.FLEET_READ,
    Permission.FLEET_DRIVER_WRITE,
    Permission.FLEET_VEHICLE_WRITE,
    Permission.FLEET_DISPATCH_WRITE,
    Permission.DISPATCH_READ,
  ],
  [OrganizationMemberRole.DISPATCH_MANAGER]: [
    Permission.ORGANIZATION_READ,
    Permission.AGENT_READ,
    Permission.AGENT_CASE_WRITE,
    Permission.AGENT_MANUAL_BOOKING_WRITE,
    Permission.AGENT_DRIVER_ASSIGN,
    Permission.DISPATCH_READ,
    Permission.DISPATCH_MANUAL_BOOKING_CREATE,
    Permission.DISPATCH_DRIVER_ASSIGN,
    Permission.DISPATCH_POLICY_WRITE,
  ],
  [OrganizationMemberRole.DISPATCHER]: [
    Permission.ORGANIZATION_READ,
    Permission.AGENT_READ,
    Permission.AGENT_CASE_WRITE,
    Permission.AGENT_MANUAL_BOOKING_WRITE,
    Permission.AGENT_DRIVER_ASSIGN,
    Permission.DISPATCH_READ,
    Permission.DISPATCH_MANUAL_BOOKING_CREATE,
    Permission.DISPATCH_DRIVER_ASSIGN,
  ],
  [OrganizationMemberRole.AGENT]: [
    Permission.ORGANIZATION_READ,
    Permission.AGENT_READ,
    Permission.AGENT_CASE_WRITE,
    Permission.AGENT_MANUAL_BOOKING_WRITE,
    Permission.AGENT_DRIVER_ASSIGN,
    Permission.DISPATCH_READ,
  ],
  [OrganizationMemberRole.FINANCE]: [
    Permission.ORGANIZATION_READ,
    Permission.FINANCE_CASHOUT_READ,
    Permission.FINANCE_CASHOUT_REVIEW,
    Permission.FINANCE_PAYOUT_READ,
    Permission.FINANCE_PAYOUT_RETRY,
    Permission.FINANCE_REFUND_CREATE,
    Permission.FINANCE_REVENUE_READ,
    Permission.FINANCE_SETTLEMENT_WRITE,
  ],
  [OrganizationMemberRole.COMPLIANCE]: [
    Permission.ORGANIZATION_READ,
    Permission.GOVERNANCE_FLAG_WRITE,
    Permission.GOVERNANCE_RISK_CASE_WRITE,
    Permission.GOVERNANCE_ALERT_ACKNOWLEDGE,
  ],
  [OrganizationMemberRole.VIEWER]: [
    Permission.ORGANIZATION_READ,
    Permission.FLEET_READ,
    Permission.AGENT_READ,
    Permission.DISPATCH_READ,
    Permission.FINANCE_CASHOUT_READ,
  ],
};

export function isValidPermission(value: string): value is Permission {
  return (
    value === ALL_PERMISSIONS_WILDCARD ||
    Object.values(Permission).includes(value as (typeof Permission)[keyof typeof Permission])
  );
}
