import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/enums';
import { AuthUser } from '../common/interfaces';
import { ReviewUserDocumentDto, UploadUserDocumentDto } from './onboarding.dto';
import { OnboardingService } from './onboarding.service';

@ApiTags('Documents & KYC')
@ApiBearerAuth()
@Controller('documents')
export class UserDocumentsController {
  constructor(private readonly service: OnboardingService) {}

  @Post()
  upload(@CurrentUser() user: AuthUser, @Body() dto: UploadUserDocumentDto) {
    return this.service.uploadDocument(user.id, dto);
  }

  @Get('mine')
  mine(@CurrentUser() user: AuthUser, @Query('documentType') documentType?: string) {
    return this.service.listDocuments(user.id, documentType);
  }

  @Get()
  @Roles(UserRole.ADMIN, UserRole.SUPPORT)
  list(@Query('status') status?: string, @Query('userId') userId?: string) {
    return this.service.adminListDocuments(status, userId);
  }

  @Patch(':id/review')
  @Roles(UserRole.ADMIN, UserRole.SUPPORT)
  review(@Param('id') id: string, @CurrentUser() user: AuthUser, @Body() dto: ReviewUserDocumentDto) {
    return this.service.reviewDocument(id, user.id, dto);
  }
}
