import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/enums';
import { OperationsControlCenterService } from './operations-control-center.service';
import { SloConfigService } from './slo-config.service';

@ApiTags('Operations')
@ApiBearerAuth()
@Controller('operations')
@Roles(UserRole.ADMIN, UserRole.SUPPORT, UserRole.DISPATCHER)
export class OperationsControlCenterController {
  constructor(
    private readonly controlCenter: OperationsControlCenterService,
    private readonly sloConfig: SloConfigService,
  ) {}

  @Get('control-center')
  dashboard() {
    return this.controlCenter.getDashboard();
  }

  @Get('control-center/health')
  health() {
    return this.controlCenter.getHealthSummary();
  }

  @Get('control-center/alerts')
  alerts() {
    return this.controlCenter.getAlertsSummary();
  }

  @Get('control-center/workers')
  workers() {
    return this.controlCenter.getWorkersSummary();
  }

  @Get('slos')
  slos() {
    return this.sloConfig.getSlos();
  }
}
