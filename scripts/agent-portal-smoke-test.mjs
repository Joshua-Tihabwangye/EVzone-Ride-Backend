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

async function login(identifier) {
  return request('/agent/auth/login', {
    method: 'POST',
    body: JSON.stringify({ identifier, password: 'Password123!' }),
  });
}

const [agentLogin, dispatcherLogin, adminLogin] = await Promise.all([
  login('agent@evzone.local'),
  login('dispatcher@evzone.local'),
  login('admin@evzone.local'),
]);
expect(agentLogin.accessToken, 'Agent login did not return an access token');
expect(dispatcherLogin.accessToken, 'Dispatcher login did not return an access token');
expect(adminLogin.accessToken, 'Admin Agent Portal login did not return an access token');

const organizationId = agentLogin.portal?.organization?.id;
expect(organizationId, 'Agent login did not resolve an organization');
expect(agentLogin.portal.portalRole === 'support_t2', 'Seeded agent role is not support_t2');
expect(dispatcherLogin.portal.portalRole === 'dispatch', 'Seeded dispatcher role is not dispatch');

const [bootstrap, dashboard, compatibility, realtime] = await Promise.all([
  request('/agent/bootstrap', {}, agentLogin.accessToken, organizationId),
  request('/agent/dashboard?period=7d', {}, agentLogin.accessToken, organizationId),
  request('/compat/contracts/agent'),
  request('/compat/realtime/events'),
]);
expect(bootstrap.api?.version === '7.0.0', 'Agent bootstrap version is not v7');
expect(bootstrap.realtime?.namespace === '/agent', 'Agent realtime namespace is missing');
expect(dashboard.metrics, 'Agent dashboard metrics are missing');
expect(compatibility.realtimeNamespace === '/agent', 'Compatibility contract lacks Agent realtime');
expect(realtime.agent?.namespace === '/agent', 'Realtime capability document lacks Agent Portal');

const suffix = Date.now().toString(36).toUpperCase();
const task = await request(
  '/agent/tasks',
  {
    method: 'POST',
    body: JSON.stringify({
      title: `Smoke support task ${suffix}`,
      category: 'SUPPORT',
      priority: 'HIGH',
      tags: ['smoke', 'agent-v7'],
    }),
  },
  agentLogin.accessToken,
  organizationId,
);
const completedTask = await request(
  `/agent/tasks/${task.id}/complete`,
  { method: 'POST', body: '{}' },
  agentLogin.accessToken,
  organizationId,
);
expect(completedTask.status === 'COMPLETED', 'Agent task completion did not persist');

const draft = await request(
  '/agent/drafts',
  {
    method: 'POST',
    body: JSON.stringify({
      draftType: 'MANUAL_BOOKING',
      title: `Airport booking ${suffix}`,
      lastStep: 'PASSENGER_DETAILS',
      payload: { pickup: 'Kampala', destination: 'Entebbe' },
    }),
  },
  dispatcherLogin.accessToken,
  organizationId,
);
expect(draft.status === 'ACTIVE', 'Agent draft was not persisted');

const ticket = await request(
  '/agent/support/tickets',
  {
    method: 'POST',
    body: JSON.stringify({
      category: 'BOOKING_ASSISTANCE',
      priority: 'HIGH',
      subject: `Agent Portal smoke case ${suffix}`,
      description: 'Customer requested assistance with a scheduled ride.',
    }),
  },
  agentLogin.accessToken,
  organizationId,
);
await request(
  `/agent/support/tickets/${ticket.id}/messages`,
  { method: 'POST', body: JSON.stringify({ message: 'The case is being investigated.', internal: false }) },
  agentLogin.accessToken,
  organizationId,
);
const ticketDetail = await request(
  `/agent/support/tickets/${ticket.id}`,
  {},
  agentLogin.accessToken,
  organizationId,
);
expect(ticketDetail.ticket.messages.length >= 2, 'Support conversation was not persisted');

const scheduledAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
const manual = await request(
  '/agent/dispatch/bookings',
  {
    method: 'POST',
    body: JSON.stringify({
      serviceType: 'RIDE',
      priority: 'NORMAL',
      customer: {
        phone: `+256700${String(Date.now()).slice(-6)}`,
        email: `agent.smoke.${suffix.toLowerCase()}@evzone.local`,
        firstName: 'Agent',
        lastName: 'Customer',
      },
      payload: {
        pickup: { address: 'Kampala Road', latitude: 0.3136, longitude: 32.5811 },
        destination: { address: 'Entebbe Airport', latitude: 0.0424, longitude: 32.4435 },
        passengerCount: 1,
      },
      scheduledAt,
      paymentMethod: 'CASH',
      quotedAmount: 85000,
      notes: 'Agent Portal v7 runtime smoke booking',
    }),
  },
  dispatcherLogin.accessToken,
  organizationId,
);
expect(manual.booking?.reference, 'Manual booking reference is missing');

const [board, liveOps, modules, teams, roles, shifts, tasks, drafts, tickets] = await Promise.all([
  request('/agent/dispatch/board', {}, dispatcherLogin.accessToken, organizationId),
  request('/agent/live-ops', {}, dispatcherLogin.accessToken, organizationId),
  request('/agent/training/modules', {}, agentLogin.accessToken, organizationId),
  request('/agent/settings/teams', {}, adminLogin.accessToken, organizationId),
  request('/agent/settings/roles', {}, adminLogin.accessToken, organizationId),
  request('/agent/settings/shifts', {}, agentLogin.accessToken, organizationId),
  request('/agent/tasks', {}, agentLogin.accessToken, organizationId),
  request('/agent/drafts', {}, dispatcherLogin.accessToken, organizationId),
  request('/agent/support/tickets', {}, agentLogin.accessToken, organizationId),
]);
expect(board.columns, 'Dispatch board columns are missing');
expect(Array.isArray(liveOps.drivers), 'Live operations driver collection is missing');
expect(modules.items?.length >= 1, 'Agent training modules were not seeded');
expect(teams.teams?.length >= 1, 'Agent teams were not seeded');
expect(Array.isArray(roles) && roles.length >= 1, 'Agent role definitions were not seeded');
expect(Array.isArray(shifts), 'Agent shifts response is invalid');
expect(Array.isArray(tasks) && tasks.some((item) => item.id === task.id), 'Agent task is missing from queue');
expect(Array.isArray(drafts) && drafts.some((item) => item.id === draft.id), 'Agent draft is missing');
expect(Array.isArray(tickets) && tickets.some((item) => item.id === ticket.id), 'Support ticket is missing');

console.log(
  JSON.stringify(
    {
      version: '7.0.0',
      organizationId,
      roles: {
        agent: agentLogin.portal.portalRole,
        dispatcher: dispatcherLogin.portal.portalRole,
        admin: adminLogin.portal.portalRole,
      },
      realtimeNamespace: bootstrap.realtime.namespace,
      created: {
        task: task.id,
        draft: draft.id,
        ticket: ticket.id,
        manualBooking: manual.booking.id,
      },
      workspace: {
        trainingModules: modules.items.length,
        teams: teams.teams.length,
        roleDefinitions: roles.length,
        shifts: shifts.length,
        liveDrivers: liveOps.drivers.length,
      },
    },
    null,
    2,
  ),
);
