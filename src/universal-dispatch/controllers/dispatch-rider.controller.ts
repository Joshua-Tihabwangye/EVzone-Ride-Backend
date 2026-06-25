import { Body, Controller, Get, Headers, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums';
import { AuthUser } from '../../common/interfaces';
import { UniversalRequestService } from '../application/universal-request.service';
import {
  CancelUniversalRequestDto,
  CreateUniversalServiceRequestDto,
  RescheduleUniversalRequestDto,
} from '../universal-dispatch.dto';

@ApiTags('Universal Dispatch - Rider')
@ApiBearerAuth()
@Controller('universal-dispatch/service-requests')
export class DispatchRiderController {
  constructor(private readonly requestService: UniversalRequestService) {}

  private getIdempotencyKey(headers: Record<string, string>): string | undefined {
    return headers['idempotency-key'];
  }

  @Post()
  @Roles(UserRole.RIDER, UserRole.CUSTOMER, UserRole.ADMIN)
  async create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateUniversalServiceRequestDto,
    @Headers() headers: Record<string, string>,
  ) {
    return this.requestService.create(user.id, dto, this.getIdempotencyKey(headers));
  }

  @Get(':requestId')
  async get(@Param('requestId') requestId: string) {
    return this.requestService.getById(requestId);
  }

  @Post(':requestId/cancel')
  async cancel(
    @CurrentUser() user: AuthUser,
    @Param('requestId') requestId: string,
    @Body() dto: CancelUniversalRequestDto,
  ) {
    dto.actorParty ??= 'RIDER' as never;
    return this.requestService.cancel(requestId, dto, user.id);
  }

  @Post(':requestId/reschedule')
  async reschedule(@Param('requestId') requestId: string, @Body() dto: RescheduleUniversalRequestDto) {
    return this.requestService.reschedule(requestId, dto);
  }
}
