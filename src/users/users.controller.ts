import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser } from '../common/interfaces';
import {
  CreateAddressDto,
  CreateContactDto,
  UpdateAddressDto,
  UpdatePreferencesDto,
  UpdateProfileDto,
} from './users.dto';
import { UsersService } from './users.service';

@ApiTags('Users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.usersService.profile(user.id);
  }

  @Patch('me')
  update(@CurrentUser() user: AuthUser, @Body() dto: UpdateProfileDto) {
    return this.usersService.updateProfile(user.id, dto);
  }

  @Get('me/addresses')
  addresses(@CurrentUser() user: AuthUser) {
    return this.usersService.listAddresses(user.id);
  }

  @Post('me/addresses')
  createAddress(@CurrentUser() user: AuthUser, @Body() dto: CreateAddressDto) {
    return this.usersService.createAddress(user.id, dto);
  }

  @Patch('me/addresses/:id')
  updateAddress(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateAddressDto) {
    return this.usersService.updateAddress(user.id, id, dto);
  }

  @Delete('me/addresses/:id')
  deleteAddress(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.usersService.deleteAddress(user.id, id);
  }

  @Get('me/contacts')
  contacts(@CurrentUser() user: AuthUser) {
    return this.usersService.listContacts(user.id);
  }

  @Post('me/contacts')
  createContact(@CurrentUser() user: AuthUser, @Body() dto: CreateContactDto) {
    return this.usersService.createContact(user.id, dto);
  }

  @Patch('me/contacts/:id')
  updateContact(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: Partial<CreateContactDto>,
  ) {
    return this.usersService.updateContact(user.id, id, dto);
  }

  @Delete('me/contacts/:id')
  deleteContact(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.usersService.deleteContact(user.id, id);
  }

  @Get('me/preferences')
  preferences(@CurrentUser() user: AuthUser) {
    return this.usersService.getPreferences(user.id);
  }

  @Patch('me/preferences')
  updatePreferences(@CurrentUser() user: AuthUser, @Body() dto: UpdatePreferencesDto) {
    return this.usersService.updatePreferences(user.id, dto);
  }
}
