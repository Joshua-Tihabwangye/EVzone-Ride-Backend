import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/enums';
import { AuthUser } from '../common/interfaces';
import { CompatibilityService } from './compatibility.service';

@ApiTags('Fleet Compatibility API')
@ApiBearerAuth()
@Controller('fleet/me')
@Roles(UserRole.FLEET_PARTNER, UserRole.FLEET_MANAGER, UserRole.ADMIN)
export class FleetCompatibilityController {
  constructor(private readonly service: CompatibilityService) {}

  @Get('profile')
  async profile(@CurrentUser() user: AuthUser) {
    const context = await this.service.fleetContext(user.id);
    return { organization: context.organization, membership: context.membership, fleet: context.fleet };
  }

  @Get('branches')
  async branches(@CurrentUser() user: AuthUser) {
    const context = await this.service.fleetContext(user.id);
    return context.fleet?.dispatchRules?.branches ?? [];
  }

  @Get('drivers')
  async drivers(@CurrentUser() user: AuthUser) {
    return (await this.service.fleetContext(user.id)).drivers;
  }

  @Get('vehicles')
  async vehicles(@CurrentUser() user: AuthUser) {
    return (await this.service.fleetContext(user.id)).vehicles;
  }

  @Get('dispatches')
  async dispatches(@CurrentUser() user: AuthUser) {
    return (await this.service.fleetContext(user.id)).assignments;
  }
}
