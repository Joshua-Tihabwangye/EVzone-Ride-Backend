import { readFileSync } from 'node:fs';

const document = JSON.parse(readFileSync('docs/openapi.json', 'utf8'));
const paths = document.paths ?? {};

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
];

const missing = requiredPaths.filter((path) => !Object.prototype.hasOwnProperty.call(paths, path));
const invalidPrefix = Object.keys(paths).filter((path) => !path.startsWith('/api/v1'));

if (missing.length || invalidPrefix.length) {
  if (missing.length) console.error(`Missing OpenAPI contract paths: ${missing.join(', ')}`);
  if (invalidPrefix.length) {
    console.error(`OpenAPI contains non-/api/v1 paths: ${invalidPrefix.slice(0, 20).join(', ')}`);
  }
  process.exit(1);
}

console.log(
  `OpenAPI contract OK: ${Object.keys(paths).length} paths, ${Object.keys(document.components?.schemas ?? {}).length} schemas`,
);
