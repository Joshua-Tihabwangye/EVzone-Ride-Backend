import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/enums';
import { AuthUser } from '../common/interfaces';
import { SubmitTrainingAssessmentDto, UpdateDriverPreferencesDto } from './driver-experience.dto';
import { DriverExperienceService } from './driver-experience.service';

@ApiTags('Driver Preferences & Learning')
@ApiBearerAuth()
@Roles(UserRole.DRIVER)
@Controller('drivers/me')
export class DriverExperienceController {
  constructor(private readonly service: DriverExperienceService) {}

  @Get('service-preferences')
  preferences(@CurrentUser() user: AuthUser) {
    return this.service.preferences(user.id);
  }

  @Patch('service-preferences')
  updatePreferences(@CurrentUser() user: AuthUser, @Body() dto: UpdateDriverPreferencesDto) {
    return this.service.updatePreferences(user.id, dto);
  }

  @Get('learning')
  learning(@CurrentUser() user: AuthUser) {
    return this.service.learning(user.id);
  }

  @Post('learning/:moduleId/start')
  start(@CurrentUser() user: AuthUser, @Param('moduleId') moduleId: string) {
    return this.service.start(user.id, moduleId);
  }

  @Post('learning/:moduleId/assessment')
  submit(
    @CurrentUser() user: AuthUser,
    @Param('moduleId') moduleId: string,
    @Body() dto: SubmitTrainingAssessmentDto,
  ) {
    return this.service.submit(user.id, moduleId, dto);
  }

  @Get('certificates')
  certificates(@CurrentUser() user: AuthUser) {
    return this.service.listCertificates(user.id);
  }
}

@ApiTags('Driver Training Certificates')
@Controller('driver-certificates')
export class DriverCertificatesController {
  constructor(private readonly service: DriverExperienceService) {}

  @Public()
  @Get(':verificationCode/verify')
  verify(@Param('verificationCode') verificationCode: string) {
    return this.service.verifyCertificate(verificationCode);
  }
}
