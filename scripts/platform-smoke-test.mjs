const baseUrl = process.env.BASE_URL ?? 'http://localhost:3000/api/v1';

async function request(path, options = {}, token) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(options.headers ?? {}),
    },
  });
  const body = await response.json();
  if (!response.ok || body.success === false) {
    throw new Error(`${options.method ?? 'GET'} ${path}: ${response.status} ${JSON.stringify(body)}`);
  }
  return body.data;
}

async function login(identifier) {
  return request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ identifier, password: 'Password123!' }),
  });
}

const [fleetLogin, agentLogin, dispatcherLogin, adminLogin] = await Promise.all([
  login('fleet.partner@evzone.local'),
  login('agent@evzone.local'),
  login('dispatcher@evzone.local'),
  login('admin@evzone.local'),
]);

const organizations = await request('/organizations/mine', {}, fleetLogin.accessToken);
const organization = organizations.find((item) => item.code === 'EVFLEET-DEMO') ?? organizations[0];
if (!organization) throw new Error('Seeded fleet organization was not found');
const organizationId = organization.id;

const [fleet, desks, accounts, drivers, vehicles] = await Promise.all([
  request(`/fleet-partners/${organizationId}/dashboard`, {}, fleetLogin.accessToken),
  request(`/dispatch/${organizationId}/desks`, {}, agentLogin.accessToken),
  request(`/corporate-pay/accounts?organizationId=${organizationId}`, {}, agentLogin.accessToken),
  request(`/fleet-partners/${organizationId}/drivers`, {}, dispatcherLogin.accessToken),
  request(`/fleet-partners/${organizationId}/vehicles`, {}, dispatcherLogin.accessToken),
]);

const desk = desks[0];
const corporatePayAccount = accounts[0];
const rideDriver = drivers.find(
  (item) => item.status === 'ACTIVE' && item.serviceCapabilities?.includes('RIDE'),
);
const rideVehicle = vehicles.find(
  (item) => item.status === 'ACTIVE' && item.serviceCapabilities?.includes('RIDE'),
);
if (!desk || !corporatePayAccount || !rideDriver || !rideVehicle) {
  throw new Error('Seeded dispatch, CorporatePay or fleet assets are missing');
}

const suffix = Date.now().toString(36);
const scheduledAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
const manual = await request(
  `/dispatch/${organizationId}/manual-bookings`,
  {
    method: 'POST',
    body: JSON.stringify({
      deskId: desk.id,
      serviceType: 'RIDE',
      customer: {
        phone: `+25671${String(Date.now()).slice(-7)}`,
        email: `platform.smoke.${suffix}@evzone.local`,
        firstName: 'Platform',
        lastName: 'Smoke',
      },
      payload: {
        pickup: { address: 'Kampala Road, Kampala', latitude: 0.3136, longitude: 32.5811 },
        destination: { address: 'Entebbe International Airport', latitude: 0.0424, longitude: 32.4435 },
        passengerCount: 1,
        scheduledAt,
      },
      scheduledAt,
      paymentMethod: 'CORPORATE_PAY',
      corporatePayAccountId: corporatePayAccount.id,
      notes: 'Automated expanded-platform smoke test',
    }),
  },
  agentLogin.accessToken,
);

const assignment = await request(
  `/dispatch/${organizationId}/manual-bookings/${manual.booking.id}/assign`,
  {
    method: 'POST',
    body: JSON.stringify({
      fleetId: rideDriver.fleetId,
      driverId: rideDriver.driverId,
      vehicleId: rideVehicle.vehicleId,
    }),
  },
  dispatcherLogin.accessToken,
);

const transaction = await request(
  `/corporate-pay/transactions/${manual.booking.corporatePayTransactionId}`,
  {},
  dispatcherLogin.accessToken,
);
const connections = await request(
  `/fleet-partners/${organizationId}/school/connections`,
  {},
  fleetLogin.accessToken,
);
const sync = await request(
  `/fleet-partners/${organizationId}/school/connections/${connections[0].id}/sync`,
  { method: 'POST', body: JSON.stringify({ direction: 'BIDIRECTIONAL', resourceType: 'VEHICLE' }) },
  dispatcherLogin.accessToken,
);
const integrationHealth = await request('/admin/integrations/health', {}, adminLogin.accessToken);

console.log(
  JSON.stringify(
    {
      organization: organization.code,
      fleetAssets: fleet.assets,
      manualBooking: { reference: manual.booking.reference, status: assignment.booking.status },
      corporatePay: transaction.transaction.status,
      schoolSync: sync.status,
      integrations: integrationHealth.outbox,
    },
    null,
    2,
  ),
);
