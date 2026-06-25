const baseUrl = process.env.BASE_URL ?? 'http://localhost:3000/api/v1';

async function request(path, options = {}, token, organizationId) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(organizationId ? { 'x-organization-id': organizationId } : {}),
      ...(options.headers ?? {}),
    },
  });
  const text = await response.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!response.ok || body?.success === false) {
    throw new Error(`${options.method ?? 'GET'} ${path}: ${response.status} ${JSON.stringify(body)}`);
  }
  return body && typeof body === 'object' && 'data' in body ? body.data : body;
}

function expect(condition, message) {
  if (!condition) throw new Error(message);
}

const login = await request('/auth/login', {
  method: 'POST',
  body: JSON.stringify({
    identifier: 'fleet.partner@evzone.local',
    password: 'Password123!',
  }),
});
const token = login.accessToken;
expect(token, 'Fleet Partner login did not return an access token');

const [flag, realtime, profile, organizations] = await Promise.all([
  request('/compat/flags/fleet'),
  request('/compat/realtime/events'),
  request('/fleet/me/profile', {}, token),
  request('/fleet/me/organizations', {}, token),
]);
expect(flag.backendEnabled === true, 'Fleet runtime backend flag is not enabled');
expect(realtime.fleet?.namespace === '/fleet', 'Fleet realtime namespace was not advertised');
expect(profile.fleetId && profile.organizationId, 'Fleet profile is incomplete');
expect(organizations.some((item) => item.fleetId === profile.fleetId), 'Fleet organization list is incomplete');

const organizationId = profile.organizationId;
const suffix = Date.now().toString(36).toUpperCase();
const scheduledAt = new Date(Date.now() + 86_400_000).toISOString();

const branch = await request(
  '/fleet/me/branches',
  {
    method: 'POST',
    body: JSON.stringify({
      name: `Smoke Branch ${suffix}`,
      address: 'Kampala Road',
      city: 'Kampala',
      country: 'UG',
      phone: `+25670${String(Date.now()).slice(-7)}`,
      managerName: 'Fleet Smoke Manager',
      operatingHours: '06:00-22:00',
    }),
  },
  token,
  organizationId,
);
const patchedBranch = await request(
  `/fleet/me/branches/${branch.id}`,
  { method: 'PATCH', body: JSON.stringify({ managerName: 'Updated Fleet Manager' }) },
  token,
  organizationId,
);
expect(patchedBranch.managerName === 'Updated Fleet Manager', 'Branch update did not persist');

const driver = await request(
  '/fleet/drivers',
  {
    method: 'POST',
    body: JSON.stringify({
      fleetAccountId: profile.fleetId,
      displayName: `Smoke Driver ${suffix}`,
      email: `fleet.smoke.${suffix.toLowerCase()}@evzone.local`,
      phone: `+25671${String(Date.now()).slice(-7)}`,
      status: 'ACTIVE',
      serviceCapabilities: ['RIDE', 'DELIVERY'],
      metadata: { city: 'Kampala', source: 'fleet-partner-smoke' },
    }),
  },
  token,
  organizationId,
);
expect(driver.status === 'ACTIVE', 'Fleet driver was not activated');

const vehicle = await request(
  '/fleet/vehicles',
  {
    method: 'POST',
    body: JSON.stringify({
      userId: login.user?.id,
      fleetAccountId: profile.fleetId,
      vehicleName: `Smoke EV ${suffix}`,
      make: 'BYD',
      model: 'Atto 3',
      yearOfManufacture: 2026,
      licensePlate: `SMK${suffix.slice(-7)}`,
      powertrain: 'BEV',
      vehicleStatus: 'ACTIVE',
      bodyType: 'SUV',
      color: 'Green',
      serviceCapabilities: ['RIDE', 'DELIVERY'],
    }),
  },
  token,
  organizationId,
);
expect(vehicle.isActive === true && vehicle.vehicleStatus === 'ACTIVE', 'Fleet vehicle was not activated');

const dispatch = await request(
  '/fleet/dispatches',
  {
    method: 'POST',
    body: JSON.stringify({
      pickup: { address: 'Kampala Road', latitude: 0.3136, longitude: 32.5811 },
      dropoff: { address: 'Entebbe Airport', latitude: 0.0424, longitude: 32.4435 },
      driverId: driver.id,
      vehicleId: vehicle.id,
      type: 'ride',
      notes: 'Fleet Partner v6 smoke dispatch',
    }),
  },
  token,
  organizationId,
);
expect(dispatch.status === 'ASSIGNED', 'Dispatch was not assigned');
const completedDispatch = await request(
  `/fleet/dispatches/${dispatch.id}`,
  { method: 'PATCH', body: JSON.stringify({ status: 'COMPLETED' }) },
  token,
  organizationId,
);
expect(completedDispatch.status === 'COMPLETED', 'Dispatch completion did not persist');

async function createService(path, customerName) {
  return request(
    path,
    {
      method: 'POST',
      body: JSON.stringify({
        customerName,
        assetId: vehicle.id,
        scheduledAt,
        notes: 'Fleet Partner v6 contract smoke',
      }),
    },
    token,
    organizationId,
  );
}

const [rental, tour, shuttle] = await Promise.all([
  createService('/fleet/rentals', `Rental Customer ${suffix}`),
  createService('/fleet/tours', `Tour Customer ${suffix}`),
  createService('/fleet/school-shuttles', `School ${suffix}`),
]);
expect(rental.service === 'rental', 'Rental response did not match the Fleet app contract');
expect(tour.service === 'tour', 'Tour response did not match the Fleet app contract');
expect(shuttle.service === 'school_shuttle', 'School shuttle response did not match the Fleet app contract');

const activeTour = await request(
  `/fleet/tours/${tour.id}`,
  { method: 'PATCH', body: JSON.stringify({ status: 'ACTIVE' }) },
  token,
  organizationId,
);
expect(activeTour.status === 'active', 'Tour status mapping is not app-compatible');
await request(
  `/fleet/tours/${tour.id}/messages`,
  { method: 'POST', body: JSON.stringify({ sender: 'Fleet Manager', text: 'Vehicle confirmed' }) },
  token,
  organizationId,
);
const messages = await request(`/fleet/tours/${tour.id}/messages`, {}, token, organizationId);
expect(messages.length >= 1, 'Tour message was not persisted');

const route = await request(
  '/fleet/school-shuttles/routes',
  { method: 'POST', body: JSON.stringify({ name: `Route ${suffix}`, pickup: 'Ntinda', dropoff: 'Kololo' }) },
  token,
  organizationId,
);
const student = await request(
  '/fleet/school-shuttles/students',
  {
    method: 'POST',
    body: JSON.stringify({ name: `Student ${suffix}`, routeId: route.id, guardianPhone: '+256700000001' }),
  },
  token,
  organizationId,
);
await Promise.all([
  request(
    '/fleet/school-shuttles/attendance',
    { method: 'POST', body: JSON.stringify({ studentId: student.id, status: 'PRESENT', date: scheduledAt }) },
    token,
    organizationId,
  ),
  request(
    '/fleet/school-shuttles/feedback',
    { method: 'POST', body: JSON.stringify({ studentId: student.id, rating: 5, message: 'Safe trip' }) },
    token,
    organizationId,
  ),
  request(
    '/fleet/school-shuttles/trips',
    { method: 'POST', body: JSON.stringify({ routeId: route.id, scheduledAt, status: 'PLANNED' }) },
    token,
    organizationId,
  ),
  request(
    '/fleet/school-shuttles/attendants',
    { method: 'POST', body: JSON.stringify({ name: `Attendant ${suffix}`, phone: '+256700000002' }) },
    token,
    organizationId,
  ),
]);

const incident = await request(
  '/fleet/compliance/incidents',
  {
    method: 'POST',
    body: JSON.stringify({
      category: 'Vehicle safety',
      severity: 'HIGH',
      status: 'OPEN',
      description: 'Automated Fleet Partner contract incident',
      reporterId: login.user?.id,
      vehicleId: vehicle.id,
      driverId: driver.id,
    }),
  },
  token,
  organizationId,
);
expect(incident.severity === 'high' && incident.status === 'open', 'Incident status mapping is not app-compatible');

const settings = await request(
  '/fleet/me/settings',
  { method: 'PATCH', body: JSON.stringify({ language: 'en', notifications: { sms: false } }) },
  token,
  organizationId,
);
expect(settings.notifications?.sms === false, 'Fleet settings update did not persist');

const [branches, drivers, vehicles, dispatches, incidents, training, notifications, payouts, earnings, security, integrations, roles, riderServices] =
  await Promise.all([
    request('/fleet/me/branches', {}, token, organizationId),
    request('/fleet/drivers', {}, token, organizationId),
    request('/fleet/vehicles', {}, token, organizationId),
    request('/fleet/dispatches', {}, token, organizationId),
    request('/fleet/compliance/incidents', {}, token, organizationId),
    request('/fleet/compliance/training-courses', {}, token, organizationId),
    request('/fleet/me/notifications', {}, token, organizationId),
    request('/fleet/earnings/payouts', {}, token, organizationId),
    request('/fleet/earnings/summary', {}, token, organizationId),
    request('/fleet/me/security', {}, token, organizationId),
    request('/fleet/me/integrations', {}, token, organizationId),
    request('/fleet/me/roles', {}, token, organizationId),
    request('/fleet/rider-services', {}, token, organizationId),
  ]);

expect(branches.some((item) => item.id === branch.id), 'Created branch is missing from list');
expect(drivers.some((item) => item.id === driver.id), 'Created driver is missing from list');
expect(vehicles.some((item) => item.id === vehicle.id), 'Created vehicle is missing from list');
expect(dispatches.some((item) => item.id === dispatch.id), 'Created dispatch is missing from list');
expect(incidents.some((item) => item.id === incident.id), 'Created incident is missing from list');
expect(Array.isArray(training) && Array.isArray(notifications) && Array.isArray(payouts), 'Workspace collections are invalid');
expect(typeof earnings.totalEarnings === 'number' && earnings.currency, 'Earnings summary is invalid');
expect(Array.isArray(security.sessions), 'Security session response is invalid');
expect(Array.isArray(integrations.integrations), 'Integrations response is invalid');
expect(Array.isArray(roles.roles), 'Roles response is invalid');
expect(Array.isArray(riderServices), 'Rider services response is invalid');

await Promise.all([
  request(`/fleet/me/branches/${branch.id}`, { method: 'DELETE' }, token, organizationId),
  request(`/fleet/drivers/${driver.id}`, { method: 'DELETE' }, token, organizationId),
  request(`/fleet/vehicles/${vehicle.id}`, { method: 'DELETE' }, token, organizationId),
]);

console.log(
  JSON.stringify(
    {
      version: '7.0.0',
      fleet: { id: profile.fleetId, organizationId, companyName: profile.companyName },
      oidcCompatible: true,
      realtimeNamespace: realtime.fleet.namespace,
      runtimeFlag: flag.backendEnabled,
      created: {
        branch: branch.id,
        driver: driver.id,
        vehicle: vehicle.id,
        dispatch: dispatch.id,
        rental: rental.id,
        tour: tour.id,
        shuttle: shuttle.id,
        route: route.id,
        student: student.id,
        incident: incident.id,
      },
      workspaceCounts: {
        branches: branches.length,
        drivers: drivers.length,
        vehicles: vehicles.length,
        dispatches: dispatches.length,
        incidents: incidents.length,
        trainingCourses: training.length,
        notifications: notifications.length,
        payouts: payouts.length,
      },
    },
    null,
    2,
  ),
);
