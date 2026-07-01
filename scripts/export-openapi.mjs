import { spawnSync } from 'node:child_process';

function run(command, args, env = {}) {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: {
      ...process.env,
      DATABASE_URL:
        process.env.DATABASE_URL ?? 'postgresql://evzone:evzone@localhost:5432/evzone',
      ...env,
    },
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

// Build the application so openapi-export.ts can be executed from dist/.
run('npm', ['run', 'build']);

// Generate the OpenAPI contract artifact.
run('node', ['dist/openapi-export.js']);
