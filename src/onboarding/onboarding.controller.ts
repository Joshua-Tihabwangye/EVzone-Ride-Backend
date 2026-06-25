import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/enums';
import { AuthUser } from '../common/interfaces';
import {
  CompleteChecklistItemDto,
  ReviewOnboardingDto,
  StartOnboardingDto,
  UpdateOnboardingDto,
} from './onboarding.dto';
import { OnboardingService } from './onboarding.service';

@ApiTags('Onboarding')
@ApiBearerAuth()
@Controller('onboarding')
export class OnboardingController {
  constructor(private readonly service: OnboardingService) {}

  @Post('applications')
  start(@CurrentUser() user: AuthUser, @Body() dto: StartOnboardingDto) {
    return this.service.start(user.id, dto);
  }

  @Get('applications/mine')
  mine(@CurrentUser() user: AuthUser) {
    return this.service.list(user.id);
  }

  @Get('applications/:id')
  detail(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.detail(user.id, id);
  }

  @Patch('applications/:id')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateOnboardingDto) {
    return this.service.update(user.id, id, dto);
  }

  @Patch('applications/:id/checklist/:key')
  item(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('key') key: string,
    @Body() dto: CompleteChecklistItemDto,
  ) {
    return this.service.completeItem(user.id, id, key, dto);
  }

  @Post('applications/:id/submit')
  submit(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.submit(user.id, id);
  }

  @Get('applications')
  @Roles(UserRole.ADMIN, UserRole.SUPPORT)
  adminList(@Query('status') status?: string, @Query('applicationType') applicationType?: string) {
    return this.service.adminList(status, applicationType);
  }

  @Patch('applications/:id/review')
  @Roles(UserRole.ADMIN)
  review(@Param('id') id: string, @CurrentUser() user: AuthUser, @Body() dto: ReviewOnboardingDto) {
    return this.service.review(id, user.id, dto);
  }
}
