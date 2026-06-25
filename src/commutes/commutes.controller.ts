import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser } from '../common/interfaces';
import { BookCommuteDto, CreateCommuteDto, UpdateCommuteDto } from './commutes.dto';
import { CommutesService } from './commutes.service';

@ApiTags('Rider Commutes')
@ApiBearerAuth()
@Controller('commutes')
export class CommutesController {
  constructor(private readonly service: CommutesService) {}

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateCommuteDto) {
    return this.service.create(user.id, dto);
  }

  @Get()
  list(@CurrentUser() user: AuthUser, @Query('active') active?: string) {
    return this.service.list(user.id, active === undefined ? undefined : active === 'true');
  }

  @Get(':id')
  detail(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.detail(user.id, id);
  }

  @Patch(':id')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateCommuteDto) {
    return this.service.update(user.id, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.remove(user.id, id);
  }

  @Post(':id/book')
  book(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: BookCommuteDto) {
    return this.service.book(user.id, id, dto);
  }
}
