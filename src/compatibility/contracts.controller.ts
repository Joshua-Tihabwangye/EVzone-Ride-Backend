import { Body, Controller, Get, Param, Post, Req, UseInterceptors } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { AuthService } from '../auth/auth.service';
import { LoginDto } from '../auth/auth.dto';
import { Public } from '../common/decorators/public.decorator';
import { currentRequestId } from '../common/request-context';
import { CompatibilityDeprecationInterceptor } from './compatibility-deprecation.interceptor';
import { CompatibilityService } from './compatibility.service';

@ApiTags('Compatibility Contracts')
@Controller('compat')
@UseInterceptors(CompatibilityDeprecationInterceptor)
export class CompatibilityContractsController {
  constructor(
    private readonly service: CompatibilityService,
    private readonly auth: AuthService,
  ) {}

  @Public()
  @Get('contracts')
  contracts() {
    return this.service.contracts();
  }

  @Public()
  @Get('canonical-routes')
  canonicalRoutes() {
    return this.service.contracts();
  }

  @Public()
  @Get('contracts/:appId')
  contract(@Param('appId') appId: string) {
    return this.service.contract(appId);
  }

  @Public()
  @Get('canonical-routes/:appId')
  canonicalContract(@Param('appId') appId: string) {
    return this.service.contract(appId);
  }

  @Public()
  @Get('flags/:appId')
  flags(@Param('appId') appId: string) {
    return this.service.runtimeFlags(appId);
  }

  @Public()
  @Get('realtime/events')
  realtime() {
    return this.service.realtimeEvents();
  }

  @Public()
  @Post(':appId/auth/sign-in')
  signIn(@Param('appId') appId: string, @Body() dto: LoginDto, @Req() request: Request) {
    this.service.contract(appId);
    return this.auth.login(dto, {
      userAgent: request.headers['user-agent'],
      ipAddress: request.ip,
    });
  }

  @Public()
  @Get('health')
  health() {
    return {
      version: process.env.npm_package_version ?? '10.0.0',
      requestId: currentRequestId(),
      compatible: true,
      compatibilityStatus: 'legacy-alias',
      sunset: process.env.LEGACY_API_SUNSET ?? '2027-06-30',
    };
  }
}
