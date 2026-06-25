import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser } from '../common/interfaces';
import { NotificationsService } from './notifications.service';
import { RegisterDeviceTokenDto } from './notifications.dto';
import { PushNotificationsService } from './push-notifications.service';

@ApiTags('Notifications')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationsController {
  constructor(
    private readonly service: NotificationsService,
    private readonly push: PushNotificationsService,
  ) {}

  @Post('devices')
  registerDevice(@CurrentUser() user: AuthUser, @Body() dto: RegisterDeviceTokenDto) {
    return this.push.register(user.id, dto);
  }

  @Get('devices')
  devices(@CurrentUser() user: AuthUser) {
    return this.push.list(user.id);
  }

  @Delete('devices/:id')
  removeDevice(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.push.remove(user.id, id);
  }

  @Get('push-history')
  pushHistory(@CurrentUser() user: AuthUser, @Query('page') page = '1', @Query('limit') limit = '20') {
    return this.push.history(user.id, Number(page), Math.min(Number(limit), 100));
  }

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
    @Query('unreadOnly') unreadOnly = 'false',
  ) {
    return this.service.list(user.id, Number(page), Math.min(Number(limit), 100), unreadOnly === 'true');
  }

  @Get('unread-count')
  count(@CurrentUser() user: AuthUser) {
    return this.service.unreadCount(user.id);
  }

  @Patch(':id/read')
  read(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.read(user.id, id);
  }

  @Patch('read-all')
  readAll(@CurrentUser() user: AuthUser) {
    return this.service.readAll(user.id);
  }
}
