export interface RouteOwner {
  audience: 'rider' | 'driver' | 'fleet' | 'agent' | 'admin' | 'partner' | 'public-tracking';
  canonicalBase: string;
  ownerModule: string;
  compatibilityBases?: string[];
  lifecycle?: string;
}

export const ROUTE_OWNERSHIP_REGISTRY: RouteOwner[] = [
  {
    audience: 'rider',
    canonicalBase: '/api/v1/rides',
    ownerModule: 'RidesModule',
    compatibilityBases: ['/api/v1/riders/me'],
    lifecycle: 'ride',
  },
  {
    audience: 'driver',
    canonicalBase: '/api/v1/driver/jobs',
    ownerModule: 'DriverJobsModule',
    compatibilityBases: ['/api/v1/drivers/me', '/api/v1/drivers/me/all-jobs'],
    lifecycle: 'ride',
  },
  {
    audience: 'fleet',
    canonicalBase: '/api/v1/fleet',
    ownerModule: 'FleetPortalModule',
    compatibilityBases: ['/api/v1/fleet/me'],
  },
  {
    audience: 'agent',
    canonicalBase: '/api/v1/agent',
    ownerModule: 'AgentPortalModule',
    compatibilityBases: ['/api/v1/dispatch'],
    lifecycle: 'support-ticket',
  },
  {
    audience: 'admin',
    canonicalBase: '/api/v1/admin',
    ownerModule: 'AdminModule',
    compatibilityBases: ['/api/v1/admins/me'],
  },
  {
    audience: 'partner',
    canonicalBase: '/api/v1/corporate-pay/partner',
    ownerModule: 'CorporateIntegrationModule',
    lifecycle: 'payment',
  },
  {
    audience: 'public-tracking',
    canonicalBase: '/api/v1/deliveries',
    ownerModule: 'DeliveriesModule',
    lifecycle: 'delivery',
  },
];
