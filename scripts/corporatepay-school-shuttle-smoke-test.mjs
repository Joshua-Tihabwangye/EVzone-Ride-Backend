const baseUrl = process.env.BASE_URL ?? 'http://localhost:3000/api/v1';
const apiKey = process.env.CORPORATEPAY_PARTNER_API_KEY ?? 'evzone-corporatepay-local-key';

async function request(path, options = {}, token, partner = false) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(partner ? { 'x-corporatepay-api-key': apiKey } : {}),
      ...(options.headers ?? {}),
    },
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  if (!response.ok || body?.success === false) {
    throw new Error(`${options.method ?? 'GET'} ${path}: ${response.status} ${JSON.stringify(body)}`);
  }
  return body && typeof body === 'object' && 'data' in body ? body.data : body;
}

function expect(condition, message) {
  if (!condition) throw new Error(message);
}

const [fleetLogin, riderLogin] = await Promise.all([
  request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ identifier: 'fleet.partner@evzone.local', password: 'Password123!' }),
  }),
  request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ identifier: 'rider@evzone.local', password: 'Password123!' }),
  }),
]);
const organizations = await request('/organizations/mine', {}, fleetLogin.accessToken);
const organization = organizations.find((item) => item.code === 'EVFLEET-DEMO') ?? organizations[0];
expect(organization?.id, 'Seeded fleet organization was not found');

const suffix = Date.now().toString(36).toUpperCase();
const externalOrganizationId = `CP-SCHOOL-ORG-${suffix}`;
const externalMemberId = `CP-SCHOOL-MEMBER-${suffix}`;
const externalRequestId = `CP-SCHOOL-REQ-${suffix}`;
const externalTripId = `SCHOOL-TRIP-${suffix}`;
const accountId = `CP-SCHOOL-ACCOUNT-${suffix}`;

await request(
  '/corporate-pay/partner/subject-links',
  {
    method: 'POST',
    body: JSON.stringify({
      organizationId: organization.id,
      externalOrganizationId,
      externalMemberId,
      userId: riderLogin.user.id,
      accountId,
      metadata: { source: 'v9-school-shuttle-runtime-smoke' },
    }),
  },
  undefined,
  true,
);

const created = await request(
  '/corporate-pay/partner/service-requests',
  {
    method: 'POST',
    body: JSON.stringify({
      externalRequestId,
      organizationId: organization.id,
      externalOrganizationId,
      externalMemberId,
      accountId,
      userId: riderLogin.user.id,
      serviceType: 'SCHOOL_SHUTTLE',
      requestKind: 'SERVICE_BOOKING',
      customer: {
        userId: riderLogin.user.id,
        email: 'rider@evzone.local',
        phone: '+256700000002',
        firstName: 'Amina',
        lastName: 'Nabirye',
      },
      servicePayload: {
        externalTripId,
        amount: 25000,
        currency: 'UGX',
      },
      costCenterId: 'SCHOOL-TRANSPORT',
      metadata: { source: 'v9-school-shuttle-runtime-smoke' },
    }),
  },
  undefined,
  true,
);
expect(created.request?.status === 'PENDING_APPROVAL', 'School Shuttle request did not enter approval state');
expect(Number(created.request?.amount) === 25000, 'School Shuttle quote amount is incorrect');

const authorized = await request(
  `/corporate-pay/partner/service-requests/${externalRequestId}/authorization?organizationId=${organization.id}`,
  {
    method: 'POST',
    body: JSON.stringify({
      externalAuthorizationId: `CP-SCHOOL-AUTH-${suffix}`,
      status: 'AUTHORIZED',
      approvedAmount: 25000,
      currency: 'UGX',
      approvalId: `CP-SCHOOL-APPROVAL-${suffix}`,
      budgetId: 'SCHOOL-TRANSPORT-BUDGET',
    }),
  },
  undefined,
  true,
);
expect(authorized.request?.serviceId === externalTripId, 'External School trip ID was not preserved');
expect(authorized.request?.manualBookingId, 'School Shuttle manual booking was not created');
expect(authorized.request?.transactionId, 'School Shuttle CorporatePay transaction was not created');
expect(authorized.transaction?.amount === 25000, 'School Shuttle payment amount was not bridged');
expect(authorized.transaction?.status === 'PAID', 'School Shuttle sandbox transaction was not settled');

const cancelled = await request(
  `/corporate-pay/partner/service-requests/${externalRequestId}/cancel?organizationId=${organization.id}`,
  {
    method: 'POST',
    body: JSON.stringify({ reason: 'SMOKE_TEST_CLEANUP' }),
  },
  undefined,
  true,
);
expect(cancelled.request?.status === 'CANCELLED', 'School Shuttle request cleanup failed');

console.log(
  JSON.stringify(
    {
      status: 'PASS',
      serviceType: created.request.serviceType,
      externalTripId,
      manualBookingId: authorized.request.manualBookingId,
      transactionId: authorized.request.transactionId,
      transactionStatus: authorized.transaction.status,
      amount: authorized.transaction.amount,
      finalStatus: cancelled.request.status,
    },
    null,
    2,
  ),
);
