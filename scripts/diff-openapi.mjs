import { readFileSync, writeFileSync, unlinkSync, renameSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const COMMITTED_PATH = 'docs/openapi.json';
const BACKUP_PATH = 'docs/openapi.json.diff-backup';

function run(command, args, env = {}) {
  return spawnSync(command, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: { ...process.env, ...env },
  });
}

function normalize(json) {
  // Sort top-level keys for stable comparison; preserve nested order.
  return JSON.stringify(json, Object.keys(json).sort(), 2);
}

// Backup the currently committed contract.
writeFileSync(BACKUP_PATH, readFileSync(COMMITTED_PATH, 'utf8'));

// Build and export a fresh spec, overwriting the committed file temporarily.
const buildResult = run('npm', ['run', 'build']);
if (buildResult.status !== 0) {
  renameSync(BACKUP_PATH, COMMITTED_PATH);
  process.exit(buildResult.status ?? 1);
}

const exportResult = run('node', ['dist/openapi-export.js']);
if (exportResult.status !== 0) {
  renameSync(BACKUP_PATH, COMMITTED_PATH);
  process.exit(exportResult.status ?? 1);
}

const committed = normalize(JSON.parse(readFileSync(BACKUP_PATH, 'utf8')));
const generated = normalize(JSON.parse(readFileSync(COMMITTED_PATH, 'utf8')));

// Always restore the committed contract.
renameSync(BACKUP_PATH, COMMITTED_PATH);

if (committed !== generated) {
  // eslint-disable-next-line no-console
  console.error(
    '\n❌ OpenAPI contract drift detected.\n' +
      'The generated OpenAPI spec differs from the committed docs/openapi.json.\n' +
      'Run `npm run openapi:export` to regenerate, review the diff, and commit the changes.\n',
  );
  process.exit(1);
}

// eslint-disable-next-line no-console
console.log('✅ OpenAPI spec matches committed contract.');
