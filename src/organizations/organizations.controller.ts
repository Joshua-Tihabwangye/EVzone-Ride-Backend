import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/enums';
import { AuthUser } from '../common/interfaces';
import {
  CreateOrganizationDto,
  InviteOrganizationMemberDto,
  OrganizationQueryDto,
  ReviewOrganizationDto,
  UpdateOrganizationDto,
  UpdateOrganizationMemberDto,
} from './organizations.dto';
import { OrganizationsService } from './organizations.service';

@ApiTags('Organizations')
@ApiBearerAuth()
@Controller('organizations')
export class OrganizationsController {
  constructor(private readonly service: OrganizationsService) {}

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateOrganizationDto) {
    return this.service.create(user, dto);
  }

  @Get('mine')
  mine(@CurrentUser() user: AuthUser) {
    return this.service.mine(user);
  }

  @Get(':id')
  detail(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.detail(user, id);
  }

  @Patch(':id')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateOrganizationDto) {
    return this.service.update(user, id, dto);
  }

  @Post(':id/members/invite')
  invite(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: InviteOrganizationMemberDto) {
    return this.service.invite(user, id, dto);
  }

  @Post(':id/invitations/accept')
  accept(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.acceptInvitation(user, id);
  }

  @Get(':id/members')
  members(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.listMembers(user, id);
  }

  @Patch(':id/members/:memberId')
  updateMember(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('memberId') memberId: string,
    @Body() dto: UpdateOrganizationMemberDto,
  ) {
    return this.service.updateMember(user, id, memberId, dto);
  }

  @Delete(':id/members/:memberId')
  removeMember(@CurrentUser() user: AuthUser, @Param('id') id: string, @Param('memberId') memberId: string) {
    return this.service.removeMember(user, id, memberId);
  }

  @Get('admin/all/list')
  @Roles(UserRole.ADMIN)
  adminList(@Query() query: OrganizationQueryDto) {
    return this.service.adminList(query);
  }

  @Patch('admin/:id/review')
  @Roles(UserRole.ADMIN)
  review(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: ReviewOrganizationDto) {
    return this.service.adminReview(user.id, id, dto);
  }
}
