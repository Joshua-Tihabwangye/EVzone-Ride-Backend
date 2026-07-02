import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as yaml from 'js-yaml';

const file = resolve(process.cwd(), 'monitoring', 'prometheus', 'alerts.yml');

function fail(message) {
  console.error(`❌ ${message}`);
  process.exitCode = 1;
}

function validate() {
  let doc;
  try {
    doc = yaml.load(readFileSync(file, 'utf8'));
  } catch (error) {
    fail(`alerts.yml is not valid YAML: ${error.message}`);
    return;
  }

  if (!doc || typeof doc !== 'object' || !Array.isArray(doc.groups)) {
    fail('alerts.yml must have a top-level "groups" array');
    return;
  }

  for (const group of doc.groups) {
    if (!group.name) {
      fail('Every alert group must have a "name"');
      continue;
    }
    if (!Array.isArray(group.rules)) {
      fail(`Group "${group.name}" must have a "rules" array`);
      continue;
    }

    for (const rule of group.rules) {
      if (!rule.alert) {
        fail(`A rule in group "${group.name}" is missing "alert"`);
        continue;
      }
      if (!rule.expr) {
        fail(`Alert "${rule.alert}" is missing "expr"`);
      }
      if (!rule.annotations || !rule.annotations.summary) {
        fail(`Alert "${rule.alert}" is missing annotation "summary"`);
      }
      if (!rule.annotations || !rule.annotations.runbook_url) {
        fail(`Alert "${rule.alert}" is missing annotation "runbook_url"`);
      }
      if (!rule.labels || !rule.labels.severity) {
        fail(`Alert "${rule.alert}" is missing label "severity"`);
      }
    }
  }

  if (!process.exitCode) {
    console.log('✅ alerts.yml is valid');
  }
}

validate();
