import { buildApp, startApp, waitForReady, post, get, shutdown, sleep, ensureDriverReady, closeDataSource } from './smoke-utils.mjs';

const port = 13005;
const baseUrl = `http://127.0.0.1:${port}/api/v1`;

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

async function run() {
  buildApp();
  const child = startApp(port, {
    PAYMENT_PROVIDER: 'MOCK',
    MOCK_PAYMENT_AUTO_APPROVE: 'true',
  });
  let passed = false;

  try {
    await waitForReady(baseUrl);

    await ensureDriverReady('driver@evzone.local');

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

    const quote = await post(
      baseUrl,
      '/rides/estimate',
      {
        pickup,
        destination,
        vehicleType: 'SUV',
        mode: 'ON_DEMAND',
        category: 'STANDARD',
        tripType: 'ONE_WAY',
        passengerCount: 1,
      },
      rider.accessToken,
    );
    if (typeof quote.total !== 'number' || quote.total <= 0) {
      throw new Error(`Expected positive fare quote, got ${JSON.stringify(quote.total)}`);
    }

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
      { 'idempotency-key': `smoke-ride-${Date.now()}` },
    );
    const rideId = rideResponse.ride?.id;
    if (!rideId) {
      throw new Error(`Ride creation did not return a ride id: ${JSON.stringify(rideResponse)}`);
    }

    const offer = await pollForOffer(driver.accessToken, rideId);
    if (!offer?.ride?.id) {
      throw new Error(`Driver offer did not reference the ride: ${JSON.stringify(offer)}`);
    }

    const accepted = await post(
      baseUrl,
      `/rides/driver/${rideId}/accept`,
      {},
      driver.accessToken,
    );
    if (accepted.ride?.status !== 'DRIVER_EN_ROUTE') {
      throw new Error(`Expected ride status DRIVER_EN_ROUTE, got ${accepted.ride?.status}`);
    }

    const final = await get(baseUrl, `/rides/${rideId}`, rider.accessToken);
    if (final.ride?.status !== 'DRIVER_EN_ROUTE') {
      throw new Error(`Expected final ride status DRIVER_EN_ROUTE, got ${final.ride?.status}`);
    }

    passed = true;
    // eslint-disable-next-line no-console
    console.log('✅ Ride-to-offer smoke test passed');
  } finally {
    await shutdown(child);
    await closeDataSource();
  }

  return passed;
}

run().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(
    '❌ Ride-to-offer smoke test failed:',
    error instanceof Error ? error.message : String(error),
  );
  process.exit(1);
});
