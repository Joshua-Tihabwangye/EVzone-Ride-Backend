import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser } from '../common/interfaces';
import { CreateStoredPaymentMethodDto, UpdateStoredPaymentMethodDto } from './financial-operations.dto';
import { FinancialOperationsService } from './financial-operations.service';

@ApiTags('Stored Payment Methods')
@ApiBearerAuth()
@Controller('payment-methods')
export class PaymentMethodsController {
  constructor(private readonly service: FinancialOperationsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.service.listMethods(user.id);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateStoredPaymentMethodDto) {
    return this.service.createMethod(user.id, dto);
  }

  @Patch(':id')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateStoredPaymentMethodDto) {
    return this.service.updateMethod(user.id, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.removeMethod(user.id, id);
  }
}
