import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Public } from '../common/decorators/public.decorator';
import { BRAND } from '../common/constants';

@ApiTags('Health')
@Controller()
export class HealthController {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

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
}
