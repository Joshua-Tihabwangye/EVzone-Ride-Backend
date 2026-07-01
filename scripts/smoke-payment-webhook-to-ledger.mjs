import {
  buildApp,
  startApp,
  waitForReady,
  post,
  get,
  shutdown,
  sleep,
  ensureDriverReady,
  closeDataSource,
  hmacSha256,
} from './smoke-utils.mjs';

const port = 13006;
const baseUrl = `http://127.0.0.1:${port}/api/v1`;
const flutterwaveWebhookSecret = 'smoke-flutterwave-webhook-secret-min-32-bytes';

const pickup = { address: 'Near driver test location, Kampala', latitude: 0.315, longitude: 32.58 };
const destination = { address: 'Acacia Mall, Kampala', latitude: 0.3382, longitude: 32.5867 };

async function pollForOffer(driverToken, rideId, attempts = 60) {
  for (let i = 0; i < attempts; i += 1) {
    const requests = await get(baseUrl, '/rides/driver/requests', driverToken);
    const match = requests.find((r) => r.ride?.id === rideId || r.offer?.serviceId === rideId);
    if (match) return match;
    await sleep(1000);
  }
  throw new Error('Driver did not receive an offer for the ride in time');
}

async function sendFlutterwaveWebhook(paymentReference, eventId) {
  const payload = {
    event: 'charge.completed',
    data: {
      id: eventId,
      status: 'successful',
      tx_ref: paymentReference,
    },
  };
  const rawBody = JSON.stringify(payload);
  const signature = hmacSha256(flutterwaveWebhookSecret, rawBody);
  const response = await fetch(`${baseUrl}/webhooks/flutterwave`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'verif-hash': signature,
    },
    body: rawBody,
  });
  const text = await response.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }
  if (!response.ok || json.success === false) {
    throw new Error(`Webhook POST failed: ${response.status} ${JSON.stringify(json)}`);
  }
  return json.data;
}

async function run() {
  buildApp();
  const child = startApp(port, {
    PAYMENT_PROVIDER: 'FLUTTERWAVE',
    FLUTTERWAVE_SECRET_KEY: 'smoke-flutterwave-secret-key-min-32-bytes',
    FLUTTERWAVE_WEBHOOK_SECRET: flutterwaveWebhookSecret,
    PUBLIC_BASE_URL: `http://127.0.0.1:${port}`,
  });

  try {
    await waitForReady(baseUrl);
    const { user: driverUser } = await ensureDriverReady('driver@evzone.local');

    const rider = await post(baseUrl, '/auth/login', {
      identifier: 'rider@evzone.local',
      password: 'Password123!',
    });
    const driver = await post(baseUrl, '/auth/login', {
      identifier: 'driver@evzone.local',
      password: 'Password123!',
    });

    await post(
      baseUrl,
      '/drivers/me/location',
      { latitude: pickup.latitude, longitude: pickup.longitude },
      driver.accessToken,
    );

    const rideResponse = await post(
      baseUrl,
      '/rides',
      {
        pickup,
        destination,
        vehicleType: 'SUV',
        mode: 'ON_DEMAND',
        category: 'STANDARD',
        tripType: 'ONE_WAY',
        passengerCount: 1,
        paymentMethod: 'CASH',
      },
      rider.accessToken,
      { 'idempotency-key': `smoke-payment-ride-${Date.now()}` },
    );
    const rideId = rideResponse.ride?.id;
    if (!rideId) throw new Error(`Ride creation did not return a ride id: ${JSON.stringify(rideResponse)}`);

    await pollForOffer(driver.accessToken, rideId);
    const accepted = await post(baseUrl, `/rides/driver/${rideId}/accept`, {}, driver.accessToken);
    if (accepted.ride?.status !== 'DRIVER_EN_ROUTE') {
      throw new Error(`Expected DRIVER_EN_ROUTE, got ${accepted.ride?.status}`);
    }

    const payment = await post(
      baseUrl,
      '/payments/intents',
      {
        serviceType: 'RIDE',
        serviceId: rideId,
        method: 'CARD',
        idempotencyKey: `smoke-payment-intent-${Date.now()}`,
      },
      rider.accessToken,
      { 'idempotency-key': `smoke-payment-intent-${Date.now()}` },
    );
    if (!payment.reference) throw new Error(`Payment intent missing reference: ${JSON.stringify(payment)}`);

    const webhookResult = await sendFlutterwaveWebhook(
      payment.reference,
      `flw-smoke-${Date.now()}`,
    );
    if (!webhookResult?.accepted) {
      throw new Error(`Webhook was not accepted: ${JSON.stringify(webhookResult)}`);
    }

    const payments = await get(baseUrl, '/payments', rider.accessToken);
    const paymentList = Array.isArray(payments) ? payments : payments.items;
    const paid = paymentList?.find((p) => p.id === payment.id);
    if (!paid || paid.status !== 'PAID') {
      throw new Error(`Expected payment PAID, got ${paid?.status}`);
    }

    const admin = await post(baseUrl, '/auth/login', {
      identifier: 'admin@evzone.local',
      password: 'Password123!',
    });
    const journals = await get(baseUrl, '/accounting/journals', admin.accessToken);
    const expectedReference = `WALLET-EARN-${payment.reference}-CREDIT-${driverUser.id}`;
    const journal = journals.find((j) => j.reference === expectedReference);
    if (!journal) throw new Error(`Expected ledger journal ${expectedReference} not found`);
    if (journal.status !== 'POSTED') throw new Error(`Expected journal POSTED, got ${journal.status}`);

    // eslint-disable-next-line no-console
    console.log('✅ Payment webhook → ledger smoke test passed');
  } finally {
    await shutdown(child);
    await closeDataSource();
  }
}

run().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(
    '❌ Payment webhook → ledger smoke test failed:',
    error instanceof Error ? error.message : String(error),
  );
  process.exit(1);
});
