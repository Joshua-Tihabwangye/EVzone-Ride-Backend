import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as yaml from 'js-yaml';

const file = resolve(process.cwd(), 'monitoring', 'alertmanager', 'alertmanager.yml');

function fail(message) {
  console.error(`❌ ${message}`);
  process.exitCode = 1;
}

function validate() {
  let doc;
  try {
    doc = yaml.load(readFileSync(file, 'utf8'));
  } catch (error) {
    fail(`alertmanager.yml is not valid YAML: ${error.message}`);
    return;
  }

  if (!doc || typeof doc !== 'object') {
    fail('alertmanager.yml must be a YAML object');
    return;
  }

  if (!doc.route) {
    fail('alertmanager.yml is missing top-level "route"');
    return;
  }

  if (!doc.receivers || !Array.isArray(doc.receivers)) {
    fail('alertmanager.yml is missing "receivers" array');
    return;
  }

  const routeReceivers = new Set();
  function collectReceivers(route) {
    if (route.receiver) routeReceivers.add(route.receiver);
    if (Array.isArray(route.routes)) {
      for (const sub of route.routes) collectReceivers(sub);
    }
  }
  collectReceivers(doc.route);

  const definedReceivers = new Set(doc.receivers.map((r) => r.name));
  for (const receiver of routeReceivers) {
    if (!definedReceivers.has(receiver)) {
      fail(`Route references undefined receiver "${receiver}"`);
    }
  }

  if (!process.exitCode) {
    console.log('✅ alertmanager.yml is valid');
  }
}

validate();
