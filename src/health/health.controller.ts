import { Controller, Get, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { InjectDataSource } from '@nestjs/typeorm';
import type { Response } from 'express';
import { DataSource } from 'typeorm';
import { Public } from '../common/decorators/public.decorator';
import { BRAND } from '../common/constants';
import { ProductionConfigService } from '../infrastructure/production-config.service';

@ApiTags('Health')
@Controller()
export class HealthController {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly production: ProductionConfigService,
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
  ready(@Res({ passthrough: true }) response: Response) {
    const readiness = this.production.readiness();
    const status = this.dataSource.isInitialized && readiness.status === 'ready' ? 'ready' : 'degraded';
    if (status !== 'ready') response.status(503);
    return {
      ...readiness,
      status,
      dependencies: {
        ...readiness.dependencies,
        database: {
          configured: true,
          connected: this.dataSource.isInitialized,
          fallback: null,
          productionReady: this.dataSource.isInitialized,
        },
      },
    };
  }
}
