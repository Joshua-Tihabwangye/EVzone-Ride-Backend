import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/enums';
import { AuthUser } from '../common/interfaces';
import {
  DriverAvailabilityDto,
  DriverDocumentDto,
  DriverLocationDto,
  EarningGoalDto,
  OnboardDriverDto,
  TrainingProgressDto,
} from './drivers.dto';
import { DriversService } from './drivers.service';

@ApiTags('Drivers')
@ApiBearerAuth()
@Controller('drivers')
export class DriversController {
  constructor(private readonly service: DriversService) {}

  @Post('onboard')
  onboard(@CurrentUser() user: AuthUser, @Body() dto: OnboardDriverDto) {
    return this.service.onboard(user.id, dto);
  }

  @Get('me')
  @Roles(UserRole.DRIVER, UserRole.ADMIN)
  me(@CurrentUser() user: AuthUser) {
    return this.service.me(user.id);
  }

  @Patch('me/availability')
  @Roles(UserRole.DRIVER)
  availability(@CurrentUser() user: AuthUser, @Body() dto: DriverAvailabilityDto) {
    return this.service.setAvailability(user.id, dto);
  }

  @Get('me/readiness')
  @Roles(UserRole.DRIVER)
  readiness(@CurrentUser() user: AuthUser, @Query('vehicleId') vehicleId?: string) {
    return this.service.readiness(user.id, vehicleId);
  }

  @Post('me/location')
  @Roles(UserRole.DRIVER)
  location(@CurrentUser() user: AuthUser, @Body() dto: DriverLocationDto) {
    return this.service.updateLocation(user.id, dto);
  }

  @Post('me/documents')
  @Roles(UserRole.DRIVER)
  uploadDocument(@CurrentUser() user: AuthUser, @Body() dto: DriverDocumentDto) {
    return this.service.uploadDocument(user.id, dto);
  }

  @Get('me/documents')
  @Roles(UserRole.DRIVER)
  documents(@CurrentUser() user: AuthUser) {
    return this.service.listDocuments(user.id);
  }

  @Post('me/weekly-goal')
  @Roles(UserRole.DRIVER)
  goal(@CurrentUser() user: AuthUser, @Body() dto: EarningGoalDto) {
    return this.service.setWeeklyGoal(user.id, dto);
  }

  @Get('me/dashboard')
  @Roles(UserRole.DRIVER)
  dashboard(@CurrentUser() user: AuthUser, @Query('from') from?: string, @Query('to') to?: string) {
    return this.service.dashboard(user.id, from ? new Date(from) : undefined, to ? new Date(to) : undefined);
  }

  @Get('me/training')
  @Roles(UserRole.DRIVER)
  training(@CurrentUser() user: AuthUser) {
    return this.service.trainingModules(user.id);
  }

  @Post('me/training/:moduleId/complete')
  @Roles(UserRole.DRIVER)
  completeTraining(
    @CurrentUser() user: AuthUser,
    @Param('moduleId') moduleId: string,
    @Body() dto: TrainingProgressDto,
  ) {
    return this.service.completeTraining(user.id, moduleId, dto);
  }
}
