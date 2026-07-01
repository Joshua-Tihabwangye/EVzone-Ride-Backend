import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Public } from '../common/decorators/public.decorator';
import { BRAND } from '../common/constants';
import { WorkerHealthService } from '../workers';

@ApiTags('Health')
@Controller()
export class HealthController {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly workerHealth: WorkerHealthService,
  ) {}

  @Public()
  @Get()
  index() {
    return {
      service: 'EVzone Ride API',
      version: process.env.npm_package_version ?? '1.0.0',
      status: 'running',
      brand: BRAND,
      documentation: '/docs',
    };
  }

  @Public()
  @Get('health')
  async health() {
    await this.dataSource.query('SELECT 1');
    return {
      status: 'ok',
      database: 'up',
      uptimeSeconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  }

  @Public()
  @Get('ready')
  ready() {
    return { status: this.dataSource.isInitialized ? 'ready' : 'starting' };
  }

  @Public()
  @Get('health/workers')
  workers() {
    const statuses = this.workerHealth.status();
    const healthy = Object.values(statuses).every((s) => s.healthy);
    return {
      status: healthy ? 'ok' : 'degraded',
      workers: statuses,
      timestamp: new Date().toISOString(),
    };
  }
}
