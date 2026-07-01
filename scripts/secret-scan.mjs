import { spawnSync } from 'node:child_process';

function hasCommand(name) {
  const result = spawnSync(name, ['--version'], { stdio: 'ignore', shell: true });
  return result.status === 0 || result.status === null;
}

if (!hasCommand('gitleaks')) {
  // eslint-disable-next-line no-console
  console.log(`gitleaks is not installed. Install it to run secret scanning locally:

  macOS:    brew install gitleaks
  Linux:    curl -sSL https://github.com/gitleaks/gitleaks/releases/latest/download/gitleaks_$(uname -s)_$(uname -m).tar.gz | tar -xz -C /usr/local/bin gitleaks
  Windows:  choco install gitleaks
  Docker:   docker run --rm -v "$PWD:/path" ghcr.io/gitleaks/gitleaks:latest detect -v --source /path

Then re-run: npm run security:secrets
`);
  process.exit(0);
}

const args = process.argv.slice(2).length > 0 ? process.argv.slice(2) : ['detect', '-v'];
const result = spawnSync('gitleaks', args, { stdio: 'inherit', shell: true });
process.exit(result.status ?? 1);
