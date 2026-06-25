import { Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../common/decorators/roles.decorator';
import { DomainEventStatus, UserRole } from '../common/enums';
import { DomainEventsService } from './domain-events.service';
import { RedisService } from './redis.service';

@ApiTags('Infrastructure')
@ApiBearerAuth()
@Controller('infrastructure')
@Roles(UserRole.ADMIN, UserRole.SUPPORT)
export class InfrastructureController {
  constructor(
    private readonly redis: RedisService,
    private readonly events: DomainEventsService,
  ) {}

  @Get('status')
  status() {
    return { redis: this.redis.status(), eventStreaming: this.events.status() };
  }

  @Get('domain-events')
  listEvents(
    @Query('page') page = '1',
    @Query('limit') limit = '50',
    @Query('status') status?: DomainEventStatus,
  ) {
    return this.events.list(Number(page), Math.min(Number(limit), 100), status);
  }

  @Post('domain-events/:id/retry')
  retry(@Param('id') id: string) {
    return this.events.retry(id);
  }

  @Post('domain-events/flush')
  flush() {
    return this.events.flush();
  }
}
