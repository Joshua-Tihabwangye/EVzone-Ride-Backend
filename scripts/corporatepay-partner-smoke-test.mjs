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
  return request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ identifier, password: 'Password123!' }),
  });
}

const [fleetLogin, riderLogin] = await Promise.all([
  login('fleet.partner@evzone.local'),
  login('rider@evzone.local'),
]);
expect(fleetLogin.accessToken, 'Fleet Partner login did not return an access token');
expect(riderLogin.user?.id, 'Rider login did not return a user');

const organizations = await request('/organizations/mine', {}, fleetLogin.accessToken);
const organization = organizations.find((item) => item.code === 'EVFLEET-DEMO') ?? organizations[0];
expect(organization?.id, 'Seeded fleet organization was not found');

const [capabilities, catalog] = await Promise.all([
  request('/corporate-pay/partner/capabilities', {}, undefined, true),
  request('/corporate-pay/partner/catalog', {}, undefined, true),
]);
expect(capabilities.backendVersion === '9.0.0', 'CorporatePay capability version is not 9.0.0');
expect(catalog.services?.some((item) => item.serviceType === 'SCHOOL_SHUTTLE'), 'Service catalog is incomplete');

const suffix = Date.now().toString(36).toUpperCase();
const externalOrganizationId = `CP-SMOKE-ORG-${suffix}`;
const externalMemberId = `CP-SMOKE-MEMBER-${suffix}`;
const externalRequestId = `CP-SMOKE-REQ-${suffix}`;
const externalAuthorizationId = `CP-SMOKE-AUTH-${suffix}`;

const subject = await request(
  '/corporate-pay/partner/subject-links',
  {
    method: 'POST',
    body: JSON.stringify({
      organizationId: organization.id,
      externalOrganizationId,
      externalMemberId,
      userId: riderLogin.user.id,
      accountId: 'CP-DEMO-FLEET-001',
      metadata: { source: 'v9-runtime-smoke' },
    }),
  },
  undefined,
  true,
);
expect(subject.organizationId === organization.id, 'CorporatePay subject link was not persisted');

const created = await request(
  '/corporate-pay/partner/service-requests',
  {
    method: 'POST',
    body: JSON.stringify({
      externalRequestId,
      idempotencyKey: `smoke:${externalRequestId}`,
      organizationId: organization.id,
      externalOrganizationId,
      externalMemberId,
      accountId: 'CP-DEMO-FLEET-001',
      userId: riderLogin.user.id,
      serviceType: 'RIDE',
      requestKind: 'SERVICE_BOOKING',
      customer: {
        userId: riderLogin.user.id,
        email: 'rider@evzone.local',
        phone: '+256700000002',
        firstName: 'Amina',
        lastName: 'Nabirye',
      },
      servicePayload: {
        pickup: { address: 'Kampala Central', latitude: 0.315, longitude: 32.58 },
        destination: {
          address: 'Entebbe International Airport',
          latitude: 0.0424,
          longitude: 32.4435,
        },
        vehicleType: 'SUV',
        mode: 'ON_DEMAND',
        category: 'STANDARD',
        tripType: 'ONE_WAY',
        passengerCount: 1,
      },
      costCenterId: 'CC-SMOKE',
      groupId: 'GROUP-SMOKE',
      purchaseOrderId: `PO-${suffix}`,
      metadata: { source: 'v9-runtime-smoke' },
    }),
  },
  undefined,
  true,
);
expect(created.request?.status === 'PENDING_APPROVAL', 'CorporatePay request did not enter approval state');
expect(Number(created.request?.amount) > 0, 'CorporatePay quote amount is invalid');

const authorized = await request(
  `/corporate-pay/partner/service-requests/${externalRequestId}/authorization?organizationId=${organization.id}`,
  {
    method: 'POST',
    body: JSON.stringify({
      externalAuthorizationId,
      status: 'AUTHORIZED',
      approvedAmount: Number(created.request.amount),
      currency: 'UGX',
      approvalId: `APPROVAL-${suffix}`,
      budgetId: 'BUDGET-SMOKE',
      budgetReservationId: `RESERVATION-${suffix}`,
      policyId: 'POLICY-SMOKE',
      policyDecision: { result: 'ALLOW', source: 'runtime-smoke' },
    }),
  },
  undefined,
  true,
);
expect(authorized.request?.serviceId, 'Authorized request was not provisioned');
expect(authorized.request?.manualBookingId, 'Provisioning did not create a manual booking');
expect(authorized.request?.transactionId, 'Provisioning did not create a CorporatePay transaction');

const evidence = await request(
  `/corporate-pay/partner/service-requests/${externalRequestId}/evidence?organizationId=${organization.id}`,
  {
    method: 'POST',
    body: JSON.stringify({
      externalEvidenceId: `EVIDENCE-${suffix}`,
      type: 'OTHER',
      actor: 'CORPORATEPAY_SMOKE',
      note: 'Partner integration runtime smoke evidence.',
    }),
  },
  undefined,
  true,
);
expect(evidence.requestId === authorized.request.id, 'Evidence was not linked to the service request');

const [detail, receipt, reconciliation, events] = await Promise.all([
  request(
    `/corporate-pay/partner/service-requests/${externalRequestId}?organizationId=${organization.id}`,
    {},
    undefined,
    true,
  ),
  request(
    `/corporate-pay/partner/service-requests/${externalRequestId}/receipt?organizationId=${organization.id}`,
    {},
    undefined,
    true,
  ),
  request(
    `/corporate-pay/partner/reconciliation/export?organizationId=${organization.id}`,
    {},
    undefined,
    true,
  ),
  request('/corporate-pay/partner/events?limit=100', {}, undefined, true),
]);
expect(detail.request?.externalRequestId === externalRequestId, 'Partner request detail is unavailable');
expect(receipt.externalRequestId === externalRequestId, 'Receipt was not generated');
expect(reconciliation.rows?.some((row) => row.externalRequestId === externalRequestId), 'Reconciliation export omitted the request');
const event = events.items?.find((item) => item.payload?.data?.externalRequestId === externalRequestId);
expect(event?.id, 'CorporatePay event outbox did not contain the request');

await request(
  `/corporate-pay/partner/events/${event.id}/ack`,
  {
    method: 'POST',
    body: JSON.stringify({ externalReceiptId: `ACK-${suffix}`, metadata: { source: 'runtime-smoke' } }),
  },
  undefined,
  true,
);

const cancelled = await request(
  `/corporate-pay/partner/service-requests/${externalRequestId}/cancel?organizationId=${organization.id}`,
  {
    method: 'POST',
    body: JSON.stringify({ reason: 'SMOKE_TEST_CLEANUP', comment: 'Automated v9 validation cleanup' }),
  },
  undefined,
  true,
);
expect(cancelled.request?.status === 'CANCELLED', 'CorporatePay request cleanup did not cancel the service');

console.log(
  JSON.stringify(
    {
      backendVersion: capabilities.backendVersion,
      organization: organization.code,
      externalRequestId,
      serviceType: created.request.serviceType,
      provisionedServiceId: authorized.request.serviceId,
      manualBookingId: authorized.request.manualBookingId,
      transactionStatus: authorized.transaction?.status,
      receiptNumber: receipt.receiptNumber,
      reconciliationRows: reconciliation.rowCount,
      eventAcknowledged: event.id,
      finalStatus: cancelled.request.status,
    },
    null,
    2,
  ),
);
