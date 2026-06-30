import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type ProcessRole = 'api' | 'worker' | 'scheduler' | 'all';

@Injectable()
export class ProcessRoleService {
  constructor(private readonly config: ConfigService) {}

  roles(): ProcessRole[] {
    const configured = this.config.get<string>('PROCESS_ROLES') ?? this.config.get<string>('PROCESS_ROLE');
    const fallback = this.isProduction() ? 'api' : 'api,worker,scheduler';
    const roles = (configured ?? fallback)
      .split(',')
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean) as ProcessRole[];
    return roles.length ? roles : ['api'];
  }

  isApi(): boolean {
    return this.has('api');
  }

  runsWorkers(): boolean {
    return this.has('worker') || this.has('scheduler');
  }

  has(role: ProcessRole): boolean {
    const roles = this.roles();
    return roles.includes('all') || roles.includes(role);
  }

  status() {
    return {
      roles: this.roles(),
      api: this.isApi(),
      workers: this.runsWorkers(),
      productionDefault: this.isProduction() ? 'api' : 'api,worker,scheduler',
    };
  }

  private isProduction(): boolean {
    return this.config.get<string>('NODE_ENV') === 'production';
  }
}
