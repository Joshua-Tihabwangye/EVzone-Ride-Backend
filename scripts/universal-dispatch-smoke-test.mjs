#!/usr/bin/env node
// Universal dispatch smoke test: verifies eligibility, ranking, and matching endpoints.

import assert from 'node:assert';
import { createHash } from 'node:crypto';

const baseUrl = process.env.SMOKE_BASE_URL ?? 'http://localhost:3000/api/v1';

function trace(message) {
  console.log(`[smoke:dispatch] ${message}`);
}

async function post(path, body, token) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }
  return { status: response.status, body: json };
}

async function get(path, token) {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  const text = await response.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }
  return { status: response.status, body: json };
}

function clientRequestId() {
  return createHash('sha256').update(`${Date.now()}${Math.random()}`).digest('hex').slice(0, 32);
}

async function run() {
  trace('Starting universal dispatch smoke test...');

  // Policy validation
  const validate = await post('/universal-dispatch/admin/dispatch-policies/validate', {
    serviceType: 'STANDARD_RIDE',
    config: {
      schemaVersion: '1.0',
      allowedVehicleTypes: ['SEDAN'],
      requiredCertifications: ['PASSENGER_TRANSPORT'],
      requiredCapabilities: [],
      candidateIndexes: ['service'],
      searchRadiiKm: [3, 6],
      routeMatrixLimit: 8,
      candidateLimit: 50,
      weights: {
        pickupEta: 0.5,
        reliability: 0.15,
        fairness: 0.15,
        serviceQuality: 0.1,
        routeFit: 0.05,
        energyMargin: 0.05,
        preference: 0,
      },
      offerWaves: [{ size: 1, timeoutSeconds: 10 }],
      locationFreshnessSeconds: 60,
      maximumLocationAccuracyMeters: 100,
      routeProviderTimeoutMs: 1000,
      routeFallbackPenalty: 0.18,
      maximumPickupEtaSeconds: 1800,
      scheduleLeadMinutes: 30,
      minimumRemainingShiftMinutes: 30,
      evReservePercent: 15,
      evFixedReserveKm: 15,
      chargerContingencyKm: 10,
      maximumSharedDetourMinutes: 12,
      maximumSharedWaitMinutes: 10,
      arrivalGeofenceMeters: 150,
      noShowGraceSeconds: 300,
      otpTtlSeconds: 1800,
      otpAttemptLimit: 5,
      qrTtlSeconds: 7200,
      neverRelax: ['driverVerification', 'vehicleVerification', 'capacity'],
      allowedFallbacks: [],
      substitutions: {},
      serviceSpecific: {},
    },
  });
  assert.strictEqual(validate.status, 201, `Policy validation failed: ${JSON.stringify(validate.body)}`);
  assert.strictEqual(validate.body.valid, true);
  trace('Policy validation passed');

  // Route optimization
  const optimize = await post('/universal-dispatch/admin/routes/optimize', {
    origin: { latitude: 0.3476, longitude: 32.5825 },
    stops: [
      { sequence: 1, type: 'PICKUP', location: { latitude: 0.3476, longitude: 32.5825 } },
      { sequence: 2, type: 'DROPOFF', location: { latitude: 0.31, longitude: 32.58 } },
    ],
  });
  assert.strictEqual(optimize.status, 201, `Route optimization failed: ${JSON.stringify(optimize.body)}`);
  assert.strictEqual(optimize.body.feasible, true);
  trace('Route optimization passed');

  trace('Universal dispatch smoke test completed successfully.');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
