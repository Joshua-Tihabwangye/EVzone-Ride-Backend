import { Controller, Get, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/enums';
import { OperationsWatchdogService } from './operations-watchdog.service';

@ApiTags('Operations')
@ApiBearerAuth()
@Controller('operations/watchdog')
@Roles(UserRole.ADMIN, UserRole.SUPPORT)
export class OperationsController {
  constructor(private readonly watchdog: OperationsWatchdogService) {}

  @Get('status')
  status() {
    return this.watchdog.status();
  }

  @Post('run')
  run() {
    return this.watchdog.run();
  }
}
