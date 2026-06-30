import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  StreamableFile,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { v2 as cloudinary, UploadApiResponse } from 'cloudinary';
import { createHash, createHmac, randomUUID } from 'node:crypto';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { extname, resolve } from 'node:path';
import { MoreThanOrEqual, Repository } from 'typeorm';
import { FileAssetStatus, UserRole } from '../common/enums';
import { AuthUser } from '../common/interfaces';
import { getRequiredSecret } from '../common/utils/required-secret.util';
import { AuditLog, FileAsset } from '../database/entities';
import { SCAN_ADAPTER } from './scanner/scanner.module';
import { ScanAdapter, ScanResult } from './scanner/scan-adapter.interface';

interface MagicSignature {
  mime: string;
  bytes: number[];
}

const MAGIC_SIGNATURES: MagicSignature[] = [
  { mime: 'image/jpeg', bytes: [0xff, 0xd8, 0xff] },
  { mime: 'image/png', bytes: [0x89, 0x50, 0x4e, 0x47] },
  { mime: 'image/webp', bytes: [0x52, 0x49, 0x46, 0x46] },
  { mime: 'application/pdf', bytes: [0x25, 0x50, 0x44, 0x46] },
  { mime: 'video/mp4', bytes: [0x00, 0x00, 0x00] },
];

const EXTENSION_WHITELIST = new Set(['.jpg', '.jpeg', '.png', '.webp', '.pdf', '.mp4']);

export interface SignedDownloadUrl {
  url: string;
  expiresAt: number;
}

@Injectable()
export class FilesService {
  private readonly logger = new Logger(FilesService.name);
  private readonly storagePath: string;
  private readonly cloudinaryEnabled: boolean;
  private readonly signatureSecret: string;

  constructor(
    @InjectRepository(FileAsset) private readonly files: Repository<FileAsset>,
    @InjectRepository(AuditLog) private readonly auditLogs: Repository<AuditLog>,
    private readonly config: ConfigService,
    @Inject(SCAN_ADAPTER) private readonly scanner: ScanAdapter,
  ) {
    this.storagePath = resolve(config.get<string>('STORAGE_PATH') ?? './storage');
    const cloudName = config.get<string>('CLOUDINARY_CLOUD_NAME')?.trim();
    const apiKey = config.get<string>('CLOUDINARY_API_KEY')?.trim();
    const apiSecret = config.get<string>('CLOUDINARY_API_SECRET')?.trim();
    this.cloudinaryEnabled = Boolean(
      cloudName && apiKey && apiSecret && config.get<string>('CLOUDINARY_DISABLED')?.toLowerCase() !== 'true',
    );
    if (this.cloudinaryEnabled) {
      cloudinary.config({ cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret, secure: true });
    }
    this.signatureSecret = getRequiredSecret(
      'FILE_SIGNATURE_SECRET',
      process.env.FILE_SIGNATURE_SECRET,
      process.env.NODE_ENV,
      { allowLocalFallback: true, localFallback: 'evzone-local-file-signature' },
    );
  }

  async upload(userId: string, file: Express.Multer.File, visibility: 'PUBLIC' | 'PRIVATE' = 'PRIVATE') {
    this.validateFile(file);
    await this.assertRateAndQuota(userId, file.size);

    const checksumSha256 = createHash('sha256').update(file.buffer).digest('hex');
    const duplicate = await this.files.findOne({ where: { ownerUserId: userId, checksumSha256 } });
    if (duplicate) return this.withAccessUrl(duplicate);

    const asset = await this.persistUpload(userId, file, visibility, checksumSha256);

    try {
      const scan = await this.scanner.scan(file.buffer, {
        originalName: asset.originalName,
        mimeType: asset.mimeType,
        sizeBytes: asset.sizeBytes,
        ownerUserId: asset.ownerUserId,
      });
      await this.applyScanResult(asset, scan);
    } catch (error) {
      this.logger.warn(`Scan failed: ${error instanceof Error ? error.message : String(error)}`);
      await this.applyScanResult(asset, { status: 'ERROR', reason: 'Scanner unavailable' });
    }

    if (asset.status === FileAssetStatus.REJECTED || asset.status === FileAssetStatus.QUARANTINED) {
      throw new ForbiddenException(asset.rejectionReason ?? 'File upload was blocked');
    }

    return this.withAccessUrl(asset);
  }

  async get(user: AuthUser, id: string) {
    const asset = await this.findAccessible(user, id);
    return this.withAccessUrl(asset);
  }

  async download(
    user: AuthUser,
    id: string,
    expiresAt: number,
    signature: string,
  ): Promise<{ kind: 'redirect'; redirectUrl: string } | { kind: 'stream'; stream: StreamableFile }> {
    const expected = this.signDownload(id, expiresAt);
    if (signature !== expected) throw new ForbiddenException('Invalid download signature');
    if (Date.now() > expiresAt) throw new ForbiddenException('Download link has expired');

    const asset = await this.findAccessible(user, id);
    if (asset.status !== FileAssetStatus.CLEAN) {
      throw new ForbiddenException('File is not available for download');
    }

    await this.audit('FILE_DOWNLOADED', asset.id, user.id);

    if (asset.storageProvider === 'CLOUDINARY' && asset.providerPublicId) {
      const signedUrl = cloudinary.url(asset.providerPublicId, {
        secure: true,
        sign_url: true,
        type: this.text(asset.metadata?.deliveryType) ?? 'authenticated',
        resource_type: this.text(asset.metadata?.resourceType) ?? 'image',
        expires_at: Math.floor(Date.now() / 1000) + 15 * 60,
      });
      return { kind: 'redirect', redirectUrl: signedUrl };
    }

    const stream = createReadStream(resolve(this.storagePath, asset.storageKey));
    return {
      kind: 'stream',
      stream: new StreamableFile(stream, {
        type: asset.mimeType,
        disposition: `inline; filename="${asset.originalName}"`,
      }),
    };
  }

  async remove(user: AuthUser, id: string) {
    const asset = await this.files.findOne({ where: { id } });
    if (!asset) throw new NotFoundException('File not found');
    if (asset.ownerUserId !== user.id && user.role !== UserRole.ADMIN) {
      throw new ForbiddenException('You cannot delete this file');
    }
    if (asset.storageProvider === 'CLOUDINARY' && asset.providerPublicId) {
      const resourceType = this.text(asset.metadata?.resourceType) ?? 'image';
      const deliveryType = this.text(asset.metadata?.deliveryType) ?? 'upload';
      await cloudinary.uploader
        .destroy(asset.providerPublicId, {
          resource_type: resourceType,
          type: deliveryType,
          invalidate: true,
        })
        .catch((error: unknown) =>
          this.logger.warn(
            `Cloudinary deletion failed: ${error instanceof Error ? error.message : String(error)}`,
          ),
        );
    } else {
      await unlink(resolve(this.storagePath, asset.storageKey)).catch(() => undefined);
    }
    await this.files.softDelete(id);
    await this.audit('FILE_DELETED', asset.id, user.id);
    return { deleted: true };
  }

  createSignedDownloadUrl(assetId: string, ttlSeconds = 300): SignedDownloadUrl {
    const expiresAt = Date.now() + ttlSeconds * 1000;
    const signature = this.signDownload(assetId, expiresAt);
    const base = (this.config.get<string>('PUBLIC_BASE_URL') ?? '').replace(/\/$/, '');
    return {
      url: `${base}/api/v1/files/${assetId}/download?expiresAt=${expiresAt}&signature=${signature}`,
      expiresAt,
    };
  }

  status() {
    const scanProvider = (this.config.get<string>('FILE_SCAN_PROVIDER') ?? 'NONE').trim().toUpperCase();
    const scanningConfigured = ['CLAMAV', 'WEBHOOK', 'VENDOR'].includes(scanProvider);
    return {
      primaryProvider: this.cloudinaryEnabled ? 'CLOUDINARY' : 'LOCAL',
      configured: this.cloudinaryEnabled,
      connected: this.cloudinaryEnabled,
      fallback: this.cloudinaryEnabled ? null : 'LOCAL',
      cloudinaryConfigured: this.cloudinaryEnabled,
      localFallbackPath: this.storagePath,
      scanProvider,
      scanner: this.scanner.providerName,
      scanningConfigured,
      productionReady:
        this.config.get<string>('NODE_ENV') !== 'production' ||
        (this.cloudinaryEnabled && scanningConfigured),
      maxFileSizeBytes: Number(this.config.get<string>('MAX_FILE_SIZE_BYTES') ?? 15 * 1024 * 1024),
    };
  }

  private signDownload(assetId: string, expiresAt: number): string {
    return createHmac('sha256', this.signatureSecret).update(`${assetId}|${expiresAt}`).digest('hex');
  }

  private async persistUpload(
    userId: string,
    file: Express.Multer.File,
    visibility: 'PUBLIC' | 'PRIVATE',
    checksumSha256: string,
  ): Promise<FileAsset> {
    if (this.cloudinaryEnabled) {
      try {
        return await this.uploadCloudinary(userId, file, visibility, checksumSha256);
      } catch (error) {
        this.logger.warn(
          `Cloudinary upload failed; using local fallback: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
    return this.uploadLocal(userId, file, visibility, checksumSha256);
  }

  private async uploadCloudinary(
    userId: string,
    file: Express.Multer.File,
    visibility: 'PUBLIC' | 'PRIVATE',
    checksumSha256: string,
  ): Promise<FileAsset> {
    const folder = this.config.get<string>('CLOUDINARY_FOLDER') ?? 'evzone-ride';
    const deliveryType = visibility === 'PRIVATE' ? 'authenticated' : 'upload';
    const result = await new Promise<UploadApiResponse>((resolveUpload, rejectUpload) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder,
          resource_type: 'auto',
          type: deliveryType,
          public_id: randomUUID(),
          overwrite: false,
          tags: ['evzone', visibility.toLowerCase()],
          context: { ownerUserId: userId, originalName: file.originalname },
        },
        (error, uploaded) => {
          if (error) rejectUpload(new Error(error.message));
          else if (!uploaded) rejectUpload(new Error('Cloudinary returned no upload result'));
          else resolveUpload(uploaded);
        },
      );
      stream.end(file.buffer);
    });
    return this.files.save(
      this.files.create({
        ownerUserId: userId,
        storageKey: result.asset_id,
        originalName: file.originalname,
        mimeType: file.mimetype,
        sizeBytes: file.size,
        url: result.secure_url,
        storageProvider: 'CLOUDINARY',
        providerPublicId: result.public_id,
        checksumSha256,
        visibility,
        status: FileAssetStatus.PENDING_SCAN,
        metadata: {
          resourceType: result.resource_type,
          deliveryType: result.type ?? deliveryType,
          format: result.format,
          width: result.width,
          height: result.height,
          bytes: result.bytes,
        },
      }),
    );
  }

  private async uploadLocal(
    userId: string,
    file: Express.Multer.File,
    visibility: 'PUBLIC' | 'PRIVATE',
    checksumSha256: string,
  ): Promise<FileAsset> {
    await mkdir(this.storagePath, { recursive: true });
    const extension = this.sanitizeExtension(extname(file.originalname));
    const storageKey = `${randomUUID()}${extension}`;
    await writeFile(resolve(this.storagePath, storageKey), file.buffer);
    return this.files.save(
      this.files.create({
        ownerUserId: userId,
        storageKey,
        originalName: file.originalname,
        mimeType: file.mimetype,
        sizeBytes: file.size,
        url: undefined,
        storageProvider: 'LOCAL',
        checksumSha256,
        visibility,
        status: FileAssetStatus.PENDING_SCAN,
      }),
    );
  }

  private async applyScanResult(asset: FileAsset, scan: ScanResult): Promise<void> {
    asset.scannedAt = new Date();
    asset.scanResult = scan.status;
    asset.scanDetails = scan.details ?? {};

    if (scan.status === 'CLEAN') {
      asset.status = FileAssetStatus.CLEAN;
    } else if (scan.status === 'INFECTED') {
      asset.status = FileAssetStatus.QUARANTINED;
      asset.rejectionReason = scan.reason ?? 'Malicious content detected';
      await this.deleteStoredFile(asset);
    } else {
      asset.status = FileAssetStatus.REJECTED;
      asset.rejectionReason = scan.reason ?? 'Scan failed';
      await this.deleteStoredFile(asset);
    }

    await this.files.save(asset);
    await this.audit(
      asset.status === FileAssetStatus.CLEAN ? 'FILE_SCAN_CLEAN' : 'FILE_SCAN_BLOCKED',
      asset.id,
      asset.ownerUserId,
      { status: asset.status, reason: asset.rejectionReason, scanResult: scan.status },
    );
  }

  private async deleteStoredFile(asset: FileAsset): Promise<void> {
    if (asset.storageProvider === 'CLOUDINARY' && asset.providerPublicId) {
      const resourceType = this.text(asset.metadata?.resourceType) ?? 'image';
      const deliveryType = this.text(asset.metadata?.deliveryType) ?? 'upload';
      await cloudinary.uploader
        .destroy(asset.providerPublicId, { resource_type: resourceType, type: deliveryType })
        .catch((error: unknown) =>
          this.logger.warn(
            `Failed to remove quarantined Cloudinary file: ${
              error instanceof Error ? error.message : String(error)
            }`,
          ),
        );
    } else if (asset.storageKey) {
      await unlink(resolve(this.storagePath, asset.storageKey)).catch(() => undefined);
    }
  }

  private async assertRateAndQuota(userId: string, sizeBytes: number): Promise<void> {
    const maxPerHour = Number(this.config.get<string>('UPLOAD_RATE_LIMIT_PER_HOUR') ?? 100);
    const maxBytesPerDay = Number(this.config.get<string>('UPLOAD_QUOTA_BYTES_PER_DAY') ?? 100 * 1024 * 1024);
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const recentCount = await this.files.count({
      where: { ownerUserId: userId, createdAt: MoreThanOrEqual(oneHourAgo) },
    });
    if (recentCount >= maxPerHour) {
      throw new BadRequestException('Upload rate limit exceeded; try again later');
    }

    const recentBytesResult = await this.files
      .createQueryBuilder('file')
      .select('COALESCE(SUM(file.sizeBytes), 0)', 'total')
      .where('file.ownerUserId = :ownerUserId', { ownerUserId: userId })
      .andWhere('file.createdAt >= :oneDayAgo', { oneDayAgo })
      .getRawOne<{ total: string }>();
    const recentBytes = Number(recentBytesResult?.total ?? 0);
    if (recentBytes + sizeBytes > maxBytesPerDay) {
      throw new BadRequestException('Upload quota exceeded for the last 24 hours');
    }
  }

  private validateFile(file: Express.Multer.File): void {
    if (!file?.buffer?.length) throw new BadRequestException('A non-empty file is required');
    const maxBytes = Number(this.config.get<string>('MAX_FILE_SIZE_BYTES') ?? 15 * 1024 * 1024);
    if (file.size > maxBytes) throw new BadRequestException(`File exceeds ${maxBytes} bytes`);

    const allowedMime = (
      this.config.get<string>('ALLOWED_UPLOAD_MIME_TYPES') ??
      'image/jpeg,image/png,image/webp,application/pdf,video/mp4'
    )
      .split(',')
      .map((item) => item.trim().toLowerCase());
    if (!allowedMime.includes(file.mimetype.toLowerCase())) {
      throw new BadRequestException(`Unsupported file type: ${file.mimetype}`);
    }

    const extension = this.sanitizeExtension(extname(file.originalname));
    if (!EXTENSION_WHITELIST.has(extension.toLowerCase())) {
      throw new BadRequestException(`Unsupported file extension: ${extension}`);
    }

    const sanitizedName = this.sanitizeFilename(file.originalname);
    if (!sanitizedName || sanitizedName.length < 3) {
      throw new BadRequestException('Invalid filename');
    }

    const detected = this.detectMagicMime(file.buffer);
    if (detected && detected !== file.mimetype.toLowerCase()) {
      throw new BadRequestException(`MIME type does not match file content: expected ${detected}`);
    }
  }

  private detectMagicMime(buffer: Buffer): string | undefined {
    for (const signature of MAGIC_SIGNATURES) {
      if (signature.bytes.every((byte, index) => buffer[index] === byte)) {
        return signature.mime;
      }
    }
    return undefined;
  }

  private sanitizeExtension(extension: string): string {
    return extension.replace(/[^.a-zA-Z0-9]/g, '').slice(0, 10);
  }

  private sanitizeFilename(name: string): string {
    const base = name.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/_{2,}/g, '_');
    return base.slice(0, 120);
  }

  private async findAccessible(user: AuthUser, id: string): Promise<FileAsset> {
    const asset = await this.files.findOne({ where: { id } });
    if (!asset) throw new NotFoundException('File not found');
    if (
      asset.visibility !== 'PUBLIC' &&
      asset.ownerUserId !== user.id &&
      ![UserRole.ADMIN, UserRole.SUPPORT].includes(user.role)
    ) {
      throw new ForbiddenException('You do not have access to this file');
    }
    return asset;
  }

  private async audit(
    action: string,
    entityId: string,
    actorUserId?: string,
    data?: Record<string, unknown>,
  ): Promise<void> {
    try {
      await this.auditLogs.save(
        this.auditLogs.create({
          action,
          entityType: 'FileAsset',
          entityId,
          actorUserId,
          data,
        }),
      );
    } catch (error) {
      this.logger.warn(
        `Failed to write audit log: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private withAccessUrl(asset: FileAsset) {
    const signed = this.createSignedDownloadUrl(asset.id);
    return {
      ...asset,
      accessUrl: asset.visibility === 'PUBLIC' ? signed.url : undefined,
      downloadUrl: signed.url,
      downloadExpiresAt: signed.expiresAt,
    };
  }

  private text(value: unknown): string | undefined {
    return typeof value === 'string' ? value : undefined;
  }
}
