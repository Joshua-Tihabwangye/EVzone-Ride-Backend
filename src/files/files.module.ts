import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditLog, FileAsset } from '../database/entities';
import { FilesController } from './files.controller';
import { FilesService } from './files.service';
import { ScannerModule } from './scanner/scanner.module';

@Module({
  imports: [TypeOrmModule.forFeature([FileAsset, AuditLog]), ScannerModule],
  controllers: [FilesController],
  providers: [FilesService],
  exports: [FilesService],
})
export class FilesModule {}
