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
  const text = await response.text();
  let body;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { raw: text };
  }
  if (!response.ok || body.success === false) {
    throw new Error(`${options.method ?? 'GET'} ${path}: ${response.status} ${JSON.stringify(body)}`);
  }
  return { data: body.data, meta: body.meta, headers: response.headers, status: response.status };
}

async function login(identifier, password = 'Password123!') {
  return (
    await request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ identifier, password }),
    })
  ).data;
}

async function createDelivery(token, suffix, index) {
  return (
    await request(
      '/deliveries',
      {
        method: 'POST',
        body: JSON.stringify({
          pickup: {
            address: `Kampala pickup ${index}`,
            latitude: 0.315 + index * 0.001,
            longitude: 32.58 + index * 0.001,
          },
          destination: {
            address: `Entebbe drop-off ${index}`,
            latitude: 0.055 + index * 0.001,
            longitude: 32.46 + index * 0.001,
          },
          serviceType: 'ELECTRIC_VEHICLE',
          packageSize: 'SMALL',
          weightKg: 2 + index,
          packageName: `Report merge parcel ${suffix}-${index}`,
          sender: { name: 'Amina Nabirye', phone: '+256700000002' },
          receiver: { name: `Recipient ${index}`, phone: `+25671${suffix.slice(-7)}` },
          paymentMethod: 'CASH',
          items: [{ name: `Parcel ${index}`, quantity: 1, unitWeightKg: 2 + index }],
        }),
      },
      token,
    )
  ).data;
}

const suffix = Date.now().toString(36);
const [admin, rider, dispatcher, deliveryDriver] = await Promise.all([
  login('admin@evzone.local'),
  login('rider@evzone.local'),
  login('dispatcher@evzone.local'),
  login('delivery.driver@evzone.local'),
]);

const [infrastructure, providerStatus, storageStatus, geoStatus] = await Promise.all([
  request('/infrastructure/status', {}, admin.accessToken),
  request('/payments/providers/status', {}, admin.accessToken),
  request('/files/storage/status', {}, admin.accessToken),
  request('/geo/infrastructure/status', {}, admin.accessToken),
]);

const compat = await request('/compat/health');
if (compat.headers.get('deprecation') !== 'true' || !compat.headers.get('sunset')) {
  throw new Error('Compatibility deprecation headers are missing');
}

const temporaryEmail = `report.merge.${suffix}@evzone.local`;
await request('/auth/register', {
  method: 'POST',
  body: JSON.stringify({
    email: temporaryEmail,
    firstName: 'Report',
    lastName: 'Validation',
    password: 'InitialPass123!',
  }),
});
const forgot = (
  await request('/auth/forgot-password', {
    method: 'POST',
    body: JSON.stringify({ identifier: temporaryEmail, channel: 'EMAIL' }),
  })
).data;
if (!forgot.debugCode) throw new Error('Development password-reset adapter did not return its debug code');
const verifiedReset = (
  await request('/auth/verify-reset-otp', {
    method: 'POST',
    body: JSON.stringify({ identifier: temporaryEmail, code: forgot.debugCode }),
  })
).data;
await request('/auth/reset-password', {
  method: 'POST',
  body: JSON.stringify({ resetToken: verifiedReset.resetToken, newPassword: 'UpdatedPass123!' }),
});
const resetLogin = await login(temporaryEmail, 'UpdatedPass123!');

const device = (
  await request(
    '/notifications/devices',
    {
      method: 'POST',
      body: JSON.stringify({
        token: `web-smoke-${suffix}`,
        platform: 'WEB',
        provider: 'LOCAL',
        deviceId: `browser-${suffix}`,
      }),
    },
    rider.accessToken,
  )
).data;
const devices = (await request('/notifications/devices', {}, rider.accessToken)).data;
if (!devices.some((item) => item.id === device.id)) throw new Error('Registered device token was not listed');

const driverBootstrap = (await request('/drivers/me/bootstrap', {}, deliveryDriver.accessToken)).data;
const driverId = driverBootstrap.profile.driver.id;
const vehicleId = driverBootstrap.profile.vehicle.id;

const deliveries = await Promise.all([
  createDelivery(rider.accessToken, suffix, 1),
  createDelivery(rider.accessToken, suffix, 2),
]);
const orders = deliveries.map((item) => item.order);

// Hydrate durable offers before manual route assignment, then verify they are cancelled on dispatch.
await request('/deliveries/driver/requests', {}, deliveryDriver.accessToken);

const routeDetail = (
  await request(
    '/delivery-routes',
    {
      method: 'POST',
      body: JSON.stringify({
        name: `Report validation route ${suffix}`,
        orderIds: orders.map((order) => order.id),
        metadata: { source: 'report-upgrades-smoke' },
      }),
    },
    dispatcher.accessToken,
  )
).data;
const routeId = routeDetail.route.id;
await request(
  `/delivery-routes/${routeId}/dispatch`,
  { method: 'POST', body: JSON.stringify({ driverId, vehicleId }) },
  dispatcher.accessToken,
);

const jobs = (await request('/matching/jobs?limit=200', {}, admin.accessToken)).data;
const routeJobs = jobs.filter((job) => orders.some((order) => order.id === job.serviceId));
if (routeJobs.length !== orders.length || routeJobs.some((job) => job.status !== 'CANCELLED')) {
  throw new Error(
    `Route dispatch did not cancel all outstanding matching jobs: ${JSON.stringify(routeJobs)}`,
  );
}

await request(
  `/delivery-routes/${routeId}/start`,
  { method: 'POST', body: '{}' },
  deliveryDriver.accessToken,
);
for (const item of deliveries) {
  const orderId = item.order.id;
  await request(
    `/deliveries/driver/${orderId}/arrive-pickup`,
    { method: 'POST', body: '{}' },
    deliveryDriver.accessToken,
  );
  await request(
    `/deliveries/driver/${orderId}/verify-pickup`,
    { method: 'POST', body: JSON.stringify({ token: item.qrToken }) },
    deliveryDriver.accessToken,
  );
  await request(
    `/deliveries/driver/${orderId}/start-transit`,
    { method: 'POST', body: '{}' },
    deliveryDriver.accessToken,
  );
  await request(
    `/deliveries/driver/${orderId}/arrive-dropoff`,
    { method: 'POST', body: '{}' },
    deliveryDriver.accessToken,
  );
  await request(
    `/deliveries/driver/${orderId}/verify-dropoff`,
    { method: 'POST', body: JSON.stringify({ code: item.dropoffCode }) },
    deliveryDriver.accessToken,
  );
  await request(
    `/deliveries/driver/${orderId}/delivered`,
    { method: 'POST', body: JSON.stringify({ proofUrl: `local://proof/${suffix}/${orderId}` }) },
    deliveryDriver.accessToken,
  );
}

const payment = (
  await request(
    '/payments/intents',
    {
      method: 'POST',
      body: JSON.stringify({
        serviceType: 'DELIVERY',
        serviceId: orders[0].id,
        method: 'CARD',
        idempotencyKey: `report-payment-${suffix}`,
      }),
    },
    rider.accessToken,
  )
).data;
const confirmedPayment = (
  await request(
    `/payments/${payment.id}/confirm`,
    { method: 'POST', body: JSON.stringify({ providerToken: '0000' }) },
    rider.accessToken,
  )
).data;
if (confirmedPayment.status !== 'PAID') throw new Error('Mock provider did not confirm the payment');

for (const order of orders) {
  await request(`/deliveries/${order.id}/complete`, { method: 'POST', body: '{}' }, rider.accessToken);
}
const completedRoute = (
  await request(
    `/delivery-routes/${routeId}/complete`,
    { method: 'POST', body: JSON.stringify({ actualDistanceKm: 42.5 }) },
    deliveryDriver.accessToken,
  )
).data;

const [trialBalance, earnings, domainEvents] = await Promise.all([
  request('/accounting/trial-balance?currency=UGX', {}, admin.accessToken),
  request('/accounting/earnings/me', {}, deliveryDriver.accessToken),
  request('/infrastructure/domain-events?limit=100', {}, admin.accessToken),
]);
if (!trialBalance.data.balanced) throw new Error('Accounting trial balance is not balanced');
if (!earnings.data.length) throw new Error('Driver earnings ledger was not populated');
if (!Array.isArray(domainEvents.data) || !domainEvents.data.length) {
  throw new Error('Durable domain-event outbox is empty');
}

await request(`/notifications/devices/${device.id}`, { method: 'DELETE' }, rider.accessToken);

console.log(
  JSON.stringify(
    {
      version: compat.data.version,
      infrastructure: {
        redisFallback: infrastructure.data.redis.fallback,
        eventFallback: infrastructure.data.eventStreaming.fallback,
        postgisApplicable: geoStatus.data.postgis.applicable,
        storageProvider: storageStatus.data.primaryProvider,
        paymentProvider: providerStatus.data.defaultProvider,
      },
      passwordResetUser: resetLogin.user.email,
      route: {
        id: routeId,
        status: completedRoute.route.status,
        orders: orders.length,
        stops: completedRoute.stops.length,
      },
      matchingJobsCancelled: routeJobs.length,
      paymentStatus: confirmedPayment.status,
      ledgerBalanced: trialBalance.data.balanced,
      earningsEntries: earnings.data.length,
      domainEvents: domainEvents.meta?.total ?? domainEvents.data.length,
      compatibilityHeaders: {
        deprecation: compat.headers.get('deprecation'),
        sunset: compat.headers.get('sunset'),
      },
    },
    null,
    2,
  ),
);
