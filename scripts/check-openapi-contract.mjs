import { readFileSync } from 'node:fs';

const document = JSON.parse(readFileSync('docs/openapi.json', 'utf8'));
const paths = document.paths ?? {};
const schemas = document.components?.schemas ?? {};

const requiredPaths = [
  '/api/v1/health',
  '/api/v1/ready',
  '/api/v1/compat/contracts',
  '/api/v1/rides',
  '/api/v1/deliveries',
  '/api/v1/driver/jobs',
  '/api/v1/fleet/dashboard',
  '/api/v1/agent/bootstrap',
  '/api/v1/admin/dashboard',
  '/api/v1/corporate-pay/partner/capabilities',
  '/api/v1/auth/login',
  '/api/v1/users/me',
  '/api/v1/mobile/v1/bootstrap',
];

const requiredAudiencePaths = {
  rider: ['/api/v1/rides', '/api/v1/deliveries'],
  driver: ['/api/v1/driver/jobs'],
  fleet: ['/api/v1/fleet/dashboard'],
  agent: ['/api/v1/agent/bootstrap'],
  admin: ['/api/v1/admin/dashboard'],
  partner: ['/api/v1/corporate-pay/partner/capabilities'],
  'public-tracking': ['/api/v1/deliveries'],
};

const missing = requiredPaths.filter((path) => !Object.prototype.hasOwnProperty.call(paths, path));
const invalidPrefix = Object.keys(paths).filter((path) => !path.startsWith('/api/v1'));

const missingOperationIds = [];
const missingResponses = [];
const missingAudience = [];

for (const [path, pathItem] of Object.entries(paths)) {
  if (!pathItem) continue;
  for (const [method, operation] of Object.entries(pathItem)) {
    if (typeof operation !== 'object' || operation === null) continue;
    if (method === 'parameters') continue;

    if (!operation.operationId) {
      missingOperationIds.push(`${method.toUpperCase()} ${path}`);
    }
    if (!operation.responses || Object.keys(operation.responses).length === 0) {
      missingResponses.push(`${method.toUpperCase()} ${path}`);
    }
    if (!operation['x-audience'] && !path.startsWith('/api/v1/compat')) {
      missingAudience.push(`${method.toUpperCase()} ${path}`);
    }
  }
}

const missingAudiencePaths = [];
for (const [audience, required] of Object.entries(requiredAudiencePaths)) {
  const hasAudience = Object.values(paths).some((pathItem) =>
    Object.values(pathItem ?? {}).some(
      (operation) =>
        typeof operation === 'object' && operation !== null && operation['x-audience'] === audience,
    ),
  );
  if (!hasAudience) {
    missingAudiencePaths.push(audience);
  }
}

let failed = false;

if (missing.length) {
  // eslint-disable-next-line no-console
  console.error(`Missing required OpenAPI paths: ${missing.join(', ')}`);
  failed = true;
}
if (invalidPrefix.length) {
  // eslint-disable-next-line no-console
  console.error(`OpenAPI contains non-/api/v1 paths: ${invalidPrefix.slice(0, 20).join(', ')}`);
  failed = true;
}
if (missingOperationIds.length) {
  // eslint-disable-next-line no-console
  console.error(`Operations missing operationId (${missingOperationIds.length}): ${missingOperationIds.slice(0, 10).join(', ')}${missingOperationIds.length > 10 ? '...' : ''}`);
  failed = true;
}
if (missingResponses.length) {
  // eslint-disable-next-line no-console
  console.error(`Operations missing responses (${missingResponses.length}): ${missingResponses.slice(0, 10).join(', ')}${missingResponses.length > 10 ? '...' : ''}`);
  failed = true;
}
if (missingAudiencePaths.length) {
  // eslint-disable-next-line no-console
  console.error(`Missing audience coverage: ${missingAudiencePaths.join(', ')}`);
  failed = true;
}
if (missingAudience.length && missingAudience.length > 10) {
  // Soft warning unless too many are missing.
  // eslint-disable-next-line no-console
  console.warn(`Operations missing x-audience (${missingAudience.length}): ${missingAudience.slice(0, 5).join(', ')}...`);
}

if (failed) {
  process.exit(1);
}

// eslint-disable-next-line no-console
console.log(
  `OpenAPI contract OK: ${Object.keys(paths).length} paths, ${Object.keys(schemas).length} schemas`,
);
