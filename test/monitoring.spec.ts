import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as yaml from 'js-yaml';

describe('Monitoring configuration', () => {
  const alertsPath = resolve(process.cwd(), 'monitoring', 'prometheus', 'alerts.yml');
  const alertmanagerPath = resolve(process.cwd(), 'monitoring', 'alertmanager', 'alertmanager.yml');
  const slosPath = resolve(process.cwd(), 'monitoring', 'slo', 'slos.yml');

  it('has valid Prometheus alert rules with required annotations', () => {
    const doc = yaml.load(readFileSync(alertsPath, 'utf8')) as {
      groups: Array<{ name: string; rules: unknown[] }>;
    };
    expect(doc.groups).toBeDefined();
    expect(doc.groups.length).toBeGreaterThan(0);

    for (const group of doc.groups) {
      expect(group.name).toBeTruthy();
      expect(Array.isArray(group.rules)).toBe(true);
      for (const rule of group.rules) {
        const r = rule as {
          alert: string;
          expr: string;
          labels?: { severity?: string };
          annotations?: { summary?: string; runbook_url?: string };
        };
        expect(r.alert).toBeTruthy();
        expect(r.expr).toBeTruthy();
        expect(r.labels?.severity).toMatch(/^(critical|warning|info)$/);
        expect(r.annotations?.summary).toBeTruthy();
        expect(r.annotations?.runbook_url).toMatch(/^https:\/\//);
      }
    }
  });

  it('has a valid Alertmanager configuration with all referenced receivers', () => {
    const doc = yaml.load(readFileSync(alertmanagerPath, 'utf8')) as {
      route: { receiver: string; routes?: Array<{ receiver: string }> };
      receivers: Array<{ name: string }>;
    };

    const referenced = new Set<string>();
    function walk(route: typeof doc.route) {
      if (route.receiver) referenced.add(route.receiver);
      route.routes?.forEach(walk);
    }
    walk(doc.route);

    const defined = new Set(doc.receivers.map((r) => r.name));
    for (const receiver of referenced) {
      expect(defined.has(receiver)).toBe(true);
    }
  });

  it('has SLO definitions with targets and expressions', () => {
    const doc = yaml.load(readFileSync(slosPath, 'utf8')) as {
      slos: Array<{ id: string; name: string; target: number; expression: string }>;
    };
    expect(doc.slos.length).toBeGreaterThan(0);
    for (const slo of doc.slos) {
      expect(slo.id).toBeTruthy();
      expect(slo.name).toBeTruthy();
      expect(slo.target).toBeGreaterThan(0);
      expect(slo.target).toBeLessThanOrEqual(1);
      expect(slo.expression).toContain('evzone_');
    }
  });
});
