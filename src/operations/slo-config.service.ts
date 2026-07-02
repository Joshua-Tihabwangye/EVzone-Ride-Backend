import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as yaml from 'js-yaml';

export interface SloDefinition {
  id: string;
  name: string;
  description: string;
  target: number;
  window: string;
  metric: string;
  expression: string;
}

interface SloFile {
  slos: SloDefinition[];
}

@Injectable()
export class SloConfigService implements OnModuleInit {
  private readonly logger = new Logger(SloConfigService.name);
  private slos: SloDefinition[] = [];

  onModuleInit(): void {
    try {
      const path = resolve(process.cwd(), 'monitoring', 'slo', 'slos.yml');
      const content = readFileSync(path, 'utf8');
      const parsed = yaml.load(content) as SloFile;
      this.slos = parsed.slos ?? [];
    } catch (error) {
      this.logger.warn(
        `Could not load SLO config: ${error instanceof Error ? error.message : String(error)}`,
      );
      this.slos = [];
    }
  }

  getSlos(): SloDefinition[] {
    return this.slos;
  }

  getSlo(id: string): SloDefinition | undefined {
    return this.slos.find((slo) => slo.id === id);
  }
}
