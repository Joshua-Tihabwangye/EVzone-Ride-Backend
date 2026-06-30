import 'reflect-metadata';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { FilesService } from '../src/files/files.service';
import { AccountStatus, FileAssetStatus, UserRole } from '../src/common/enums';
import { AuditLog, ENTITIES, FileAsset, User } from '../src/database/entities';
import { ScanAdapter, ScanResult } from '../src/files/scanner/scan-adapter.interface';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function pngBuffer(): Buffer {
  return Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
}

function fakeFile(buffer: Buffer, name: string, mime: string): Express.Multer.File {
  return {
    fieldname: 'file',
    originalname: name,
    encoding: '7bit',
    mimetype: mime,
    size: buffer.length,
    buffer,
    stream: null as any,
    destination: '',
    filename: name,
    path: '',
  };
}

describe('Upload security (Phase 1.7)', () => {
  let db: DataSource;
  let storagePath: string;
  let service: FilesService;
  let scanResult: ScanResult = { status: 'CLEAN' };
  let user: User;
  let adminUser: User;
  let otherUser: User;

  beforeAll(async () => {
    db = new DataSource({
      type: 'sqljs',
      entities: [...ENTITIES],
      synchronize: true,
      dropSchema: true,
      logging: false,
    });
    await db.initialize();

    storagePath = mkdtempSync(join(tmpdir(), 'evzone-upload-test-'));
    process.env.FILE_SIGNATURE_SECRET = 'upload-security-test-signature-secret-min-32';

    const mockScanner: ScanAdapter = {
      providerName: 'MOCK',
      scan: async () => scanResult,
    };

    const config = new ConfigService({
      NODE_ENV: 'test',
      STORAGE_PATH: storagePath,
      MAX_FILE_SIZE_BYTES: '10485760',
      ALLOWED_UPLOAD_MIME_TYPES: 'image/jpeg,image/png,image/webp,application/pdf,video/mp4',
      UPLOAD_RATE_LIMIT_PER_HOUR: '100',
      UPLOAD_QUOTA_BYTES_PER_DAY: '104857600',
      FILE_SIGNATURE_SECRET: process.env.FILE_SIGNATURE_SECRET,
      PUBLIC_BASE_URL: 'http://localhost:3000',
      FILE_SCAN_PROVIDER: 'MOCK',
      CLOUDINARY_DISABLED: 'true',
    });

    service = new FilesService(db.getRepository(FileAsset), db.getRepository(AuditLog), config, mockScanner);

    const userRepo = db.getRepository(User);
    user = await userRepo.save(
      userRepo.create({
        email: 'uploader@evzone.local',
        firstName: 'Upload',
        lastName: 'User',
        role: UserRole.RIDER,
        status: AccountStatus.ACTIVE,
        passwordHash: 'not-used',
      }),
    );
    adminUser = await userRepo.save(
      userRepo.create({
        email: 'admin@evzone.local',
        firstName: 'Admin',
        lastName: 'User',
        role: UserRole.ADMIN,
        status: AccountStatus.ACTIVE,
        passwordHash: 'not-used',
      }),
    );
    otherUser = await userRepo.save(
      userRepo.create({
        email: 'other@evzone.local',
        firstName: 'Other',
        lastName: 'User',
        role: UserRole.RIDER,
        status: AccountStatus.ACTIVE,
        passwordHash: 'not-used',
      }),
    );
  });

  afterAll(async () => {
    await db.destroy();
    rmSync(storagePath, { recursive: true, force: true });
  });

  beforeEach(async () => {
    scanResult = { status: 'CLEAN' };
    await db.getRepository(FileAsset).clear();
    await db.getRepository(AuditLog).clear();
  });

  describe('upload lifecycle', () => {
    it('stores file as PENDING_SCAN then marks CLEAN after mock scan', async () => {
      const file = fakeFile(pngBuffer(), 'avatar.png', 'image/png');
      const result = await service.upload(user.id, file, 'PRIVATE');
      expect(result.status).toBe(FileAssetStatus.CLEAN);
      expect(result.storageProvider).toBe('LOCAL');
      expect(result.downloadUrl).toContain('/files/');

      const persisted = await db.getRepository(FileAsset).findOne({ where: { id: result.id } });
      expect(persisted?.status).toBe(FileAssetStatus.CLEAN);
      expect(persisted?.scanResult).toBe('CLEAN');

      const logs = await db.getRepository(AuditLog).find({ where: { entityId: result.id } });
      expect(logs.map((l) => l.action)).toContain('FILE_SCAN_CLEAN');
    });

    it('quarantines infected files and removes local storage', async () => {
      scanResult = { status: 'INFECTED', reason: 'EICAR-TEST-SIGNATURE' };
      const file = fakeFile(pngBuffer(), 'malware.png', 'image/png');
      await expect(service.upload(user.id, file, 'PRIVATE')).rejects.toThrow(/EICAR/);
      const asset = await db
        .getRepository(FileAsset)
        .findOne({ where: { ownerUserId: user.id }, order: { createdAt: 'DESC' } });
      expect(asset?.status).toBe(FileAssetStatus.QUARANTINED);
      expect(asset?.rejectionReason).toContain('EICAR');
    });

    it('rejects files when scanner returns ERROR', async () => {
      scanResult = { status: 'ERROR', reason: 'Scanner unavailable' };
      const file = fakeFile(pngBuffer(), 'error.png', 'image/png');
      await expect(service.upload(user.id, file, 'PRIVATE')).rejects.toThrow(/Scanner unavailable/);
      const asset = await db
        .getRepository(FileAsset)
        .findOne({ where: { ownerUserId: user.id }, order: { createdAt: 'DESC' } });
      expect(asset?.status).toBe(FileAssetStatus.REJECTED);
    });
  });

  describe('input validation', () => {
    it('rejects unsupported extensions', async () => {
      const file = fakeFile(pngBuffer(), 'script.exe', 'image/png');
      await expect(service.upload(user.id, file, 'PRIVATE')).rejects.toThrow(/Unsupported file extension/);
    });

    it('rejects mismatched magic bytes', async () => {
      const buffer = Buffer.from([0xff, 0xd8, 0xff, 0x00]); // JPEG magic with PNG MIME
      const file = fakeFile(buffer, 'mismatch.png', 'image/png');
      await expect(service.upload(user.id, file, 'PRIVATE')).rejects.toThrow(
        /MIME type does not match file content/,
      );
    });

    it('rejects oversized files', async () => {
      const huge = Buffer.alloc(11 * 1024 * 1024);
      const file = fakeFile(huge, 'huge.png', 'image/png');
      await expect(service.upload(user.id, file, 'PRIVATE')).rejects.toThrow(/File exceeds/);
    });

    it('rejects unsupported MIME types', async () => {
      const file = fakeFile(pngBuffer(), 'file.zip', 'application/zip');
      await expect(service.upload(user.id, file, 'PRIVATE')).rejects.toThrow(/Unsupported file type/);
    });
  });

  describe('rate and quota limits', () => {
    it('enforces per-user upload quota', async () => {
      const config = new ConfigService({
        NODE_ENV: 'test',
        STORAGE_PATH: storagePath,
        MAX_FILE_SIZE_BYTES: '10485760',
        ALLOWED_UPLOAD_MIME_TYPES: 'image/jpeg,image/png,image/webp,application/pdf,video/mp4',
        UPLOAD_RATE_LIMIT_PER_HOUR: '100',
        UPLOAD_QUOTA_BYTES_PER_DAY: '10',
        FILE_SIGNATURE_SECRET: process.env.FILE_SIGNATURE_SECRET,
        PUBLIC_BASE_URL: 'http://localhost:3000',
        FILE_SCAN_PROVIDER: 'MOCK',
        CLOUDINARY_DISABLED: 'true',
      });
      const quotaService = new FilesService(db.getRepository(FileAsset), db.getRepository(AuditLog), config, {
        providerName: 'MOCK',
        scan: async () => ({ status: 'CLEAN' }),
      });
      const file = fakeFile(pngBuffer(), 'quota.png', 'image/png');
      await expect(quotaService.upload(user.id, file, 'PRIVATE')).rejects.toThrow(/Upload quota exceeded/);
    });
  });

  describe('access control and signed downloads', () => {
    it('allows owner to download a CLEAN file', async () => {
      const file = fakeFile(pngBuffer(), 'download.png', 'image/png');
      const asset = await service.upload(user.id, file, 'PRIVATE');
      const signed = service.createSignedDownloadUrl(asset.id);
      const url = new URL(signed.url);
      const expiresAt = Number(url.searchParams.get('expiresAt'));
      const signature = url.searchParams.get('signature')!;

      const result = await service.download(
        { id: user.id, role: user.role } as any,
        asset.id,
        expiresAt,
        signature,
      );
      expect(result.kind).toBe('stream');
    });

    it('blocks downloads with invalid signature', async () => {
      const file = fakeFile(pngBuffer(), 'signed.png', 'image/png');
      const asset = await service.upload(user.id, file, 'PRIVATE');
      await expect(
        service.download(
          { id: user.id, role: user.role } as any,
          asset.id,
          Date.now() + 300_000,
          'bad-signature',
        ),
      ).rejects.toThrow('Invalid download signature');
    });

    it('blocks expired download links', async () => {
      const file = fakeFile(pngBuffer(), 'expired.png', 'image/png');
      const asset = await service.upload(user.id, file, 'PRIVATE');
      const signed = service.createSignedDownloadUrl(asset.id, -1);
      const url = new URL(signed.url);
      const expiresAt = Number(url.searchParams.get('expiresAt'));
      const signature = url.searchParams.get('signature')!;
      await expect(
        service.download({ id: user.id, role: user.role } as any, asset.id, expiresAt, signature),
      ).rejects.toThrow('Download link has expired');
    });

    it('blocks non-owners from downloading private files', async () => {
      const file = fakeFile(pngBuffer(), 'private.png', 'image/png');
      const asset = await service.upload(user.id, file, 'PRIVATE');
      const signed = service.createSignedDownloadUrl(asset.id);
      const url = new URL(signed.url);
      await expect(
        service.download(
          { id: otherUser.id, role: otherUser.role } as any,
          asset.id,
          Number(url.searchParams.get('expiresAt')),
          url.searchParams.get('signature')!,
        ),
      ).rejects.toThrow('You do not have access');
    });

    it('prevents downloading files that are not CLEAN', async () => {
      scanResult = { status: 'INFECTED', reason: 'virus' };
      const file = fakeFile(pngBuffer(), 'dirty.png', 'image/png');
      await expect(service.upload(user.id, file, 'PRIVATE')).rejects.toThrow();
      const asset = await db
        .getRepository(FileAsset)
        .findOne({ where: { ownerUserId: user.id }, order: { createdAt: 'DESC' } });
      const signed = service.createSignedDownloadUrl(asset!.id);
      const url = new URL(signed.url);
      await expect(
        service.download(
          { id: user.id, role: user.role } as any,
          asset!.id,
          Number(url.searchParams.get('expiresAt')),
          url.searchParams.get('signature')!,
        ),
      ).rejects.toThrow('File is not available for download');
    });

    it('returns public access URL for public files', async () => {
      const file = fakeFile(pngBuffer(), 'public.png', 'image/png');
      const asset = await service.upload(user.id, file, 'PUBLIC');
      expect(asset.downloadUrl).toContain('/files/');
    });
  });

  describe('duplicate detection and removal', () => {
    it('returns existing asset for duplicate checksum', async () => {
      const file = fakeFile(pngBuffer(), 'duplicate.png', 'image/png');
      const first = await service.upload(user.id, file, 'PRIVATE');
      const second = await service.upload(user.id, file, 'PRIVATE');
      expect(second.id).toBe(first.id);
    });

    it('allows owners and admins to delete files', async () => {
      const file = fakeFile(pngBuffer(), 'deleteme.png', 'image/png');
      const asset = await service.upload(user.id, file, 'PRIVATE');
      const deletedByOwner = await service.remove({ id: user.id, role: user.role } as any, asset.id);
      expect(deletedByOwner.deleted).toBe(true);

      const file2 = fakeFile(pngBuffer(), 'deleteme-admin.png', 'image/png');
      const asset2 = await service.upload(user.id, file2, 'PRIVATE');
      const deletedByAdmin = await service.remove(
        { id: adminUser.id, role: adminUser.role } as any,
        asset2.id,
      );
      expect(deletedByAdmin.deleted).toBe(true);
    });
  });

  describe('service status', () => {
    it('reports local fallback and scanner configuration', () => {
      const status = service.status();
      expect(status.primaryProvider).toBe('LOCAL');
      expect(status.scanProvider).toBe('MOCK');
      expect(status.scanningConfigured).toBe(false);
      expect(status.productionReady).toBe(true);
    });
  });
});
