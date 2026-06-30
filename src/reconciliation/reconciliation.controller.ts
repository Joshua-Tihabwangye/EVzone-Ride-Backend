import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UserRole } from '../common/enums';
import { AuthUser } from '../common/interfaces';
import {
  ReconciliationRecordsQueryDto,
  ReconciliationRunsQueryDto,
  ResolveReconciliationRecordDto,
  StartReconciliationRunDto,
  UploadSettlementDto,
} from './reconciliation.dto';
import { ReconciliationService } from './reconciliation.service';
import { SettlementAdapterFactory } from './adapters/settlement-adapter.factory';

@ApiTags('Admin Reconciliation')
@ApiBearerAuth()
@Controller('admin/reconciliation')
export class ReconciliationController {
  constructor(
    private readonly service: ReconciliationService,
    private readonly adapterFactory: SettlementAdapterFactory,
  ) {}

  @Post('runs')
  @Roles(UserRole.ADMIN, UserRole.SUPPORT)
  startRun(@CurrentUser() user: AuthUser, @Body() dto: StartReconciliationRunDto) {
    return this.service.startRun({
      type: dto.type,
      periodStart: new Date(dto.periodStart),
      periodEnd: new Date(dto.periodEnd),
      provider: dto.provider,
      tolerance: dto.tolerance,
      createdByUserId: user.id,
      fileContent: dto.fileContent,
      fileMimeType: dto.fileMimeType,
      columnMapping: dto.columnMapping,
    });
  }

  @Get('runs')
  @Roles(UserRole.ADMIN, UserRole.SUPPORT)
  listRuns(@Query() query: ReconciliationRunsQueryDto) {
    return this.service.listRuns(query.type, query.status);
  }

  @Get('runs/:id')
  @Roles(UserRole.ADMIN, UserRole.SUPPORT)
  getRun(@Param('id') id: string) {
    return this.service.getRun(id);
  }

  @Get('runs/:id/records')
  @Roles(UserRole.ADMIN, UserRole.SUPPORT)
  listRecords(@Param('id') id: string, @Query() query: ReconciliationRecordsQueryDto) {
    return this.service.listRecords(id, query.status);
  }

  @Post('runs/:id/records/:recordId/resolve')
  @Roles(UserRole.ADMIN, UserRole.SUPPORT)
  resolveRecord(
    @CurrentUser() user: AuthUser,
    @Param('id') runId: string,
    @Param('recordId') recordId: string,
    @Body() dto: ResolveReconciliationRecordDto,
  ) {
    return this.service.resolveRecord(recordId, dto, user.id);
  }

  @Post('upload-settlement')
  @Roles(UserRole.ADMIN, UserRole.SUPPORT)
  async uploadSettlement(@CurrentUser() user: AuthUser, @Body() dto: UploadSettlementDto) {
    return this.service.startRun({
      type: dto.type,
      periodStart: dto.statementDate ? new Date(dto.statementDate) : new Date(),
      periodEnd: dto.statementDate ? new Date(dto.statementDate) : new Date(),
      provider: dto.provider,
      tolerance: dto.tolerance,
      createdByUserId: user.id,
      fileContent: dto.fileContent,
      fileMimeType: dto.fileMimeType,
      columnMapping: dto.columnMapping,
    });
  }

  @Get('providers')
  @Roles(UserRole.ADMIN, UserRole.SUPPORT)
  providers() {
    return { providers: this.adapterFactory.providers() };
  }
}
