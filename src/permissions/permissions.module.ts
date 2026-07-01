import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Organization, OrganizationMember } from '../database/entities';
import { PermissionGuard } from './permission.guard';
import { PermissionsService } from './permissions.service';
import { TenantContextInterceptor } from './tenant-context.interceptor';

@Module({
  imports: [TypeOrmModule.forFeature([Organization, OrganizationMember])],
  providers: [
    PermissionsService,
    PermissionGuard,
    { provide: APP_INTERCEPTOR, useClass: TenantContextInterceptor },
  ],
  exports: [PermissionsService, PermissionGuard],
})
export class PermissionsModule {}
