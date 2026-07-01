# Tenant Scoping Rollout

## Pattern

Use the helpers from `src/permissions` for every list/detail query that reads
organization-owned data.

```ts
import { TenantScopeHelper } from '../permissions';

// TypeORM QueryBuilder
const qb = this.repository.createQueryBuilder('alias');
TenantScopeHelper.applyTenantScope(qb, 'alias', user.activeOrganizationId, user.isPlatformAdmin);

// TypeORM find options
const items = await this.repository.find({
  where: TenantScopeHelper.withOrganizationId(
    { status: SomeStatus.ACTIVE },
    user.activeOrganizationId,
    user.isPlatformAdmin,
  ),
});
```

## Rules

- Always pass `user.activeOrganizationId` and `user.isPlatformAdmin` from the
  authenticated request context.
- Platform admins (`isPlatformAdmin === true`) are not scoped and can read
  across tenants.
- Non-admins without an active organization must receive a `403 Forbidden` for
  endpoints that require tenant scoping.

## Entities that still need explicit scoping

The following entities now have an `organizationId` column and population at
write time, but most list/detail queries still need to be updated to use
`TenantScopeHelper`:

- `Ride`
- `DeliveryOrder`
- `TouristBooking`
- `AmbulanceRequest`
- `RentalBooking`
- `Payment`
- `WalletTransaction`
- `Payout`
- `CashoutRequest`
- `UniversalServiceRequest`

## Representative examples already updated

- `CashoutsController.list` + `FinancialOperationsService.listCashouts`
- `PayoutsController.list`
- Manual booking queries already scoped by `organizationId` in `DispatchService`
