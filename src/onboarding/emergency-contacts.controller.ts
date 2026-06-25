import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser } from '../common/interfaces';
import { CreateEmergencyContactDto } from './onboarding.dto';
import { OnboardingService } from './onboarding.service';

@ApiTags('Emergency Contacts')
@ApiBearerAuth()
@Controller('emergency-contacts')
export class EmergencyContactsController {
  constructor(private readonly service: OnboardingService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.service.listContacts(user.id);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateEmergencyContactDto) {
    return this.service.createContact(user.id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.removeContact(user.id, id);
  }
}
