import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { v2 as cloudinary, UploadApiResponse } from 'cloudinary';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { extname, resolve } from 'node:path';
import { Repository } from 'typeorm';
import { UserRole } from '../common/enums';
import { AuthUser } from '../common/interfaces';
import { FileAsset } from '../database/entities';

@Injectable()
export class FilesService {
  private readonly logger = new Logger(FilesService.name);
  private readonly storagePath: string;
  private readonly cloudinaryEnabled: boolean;

  constructor(
    @InjectRepository(FileAsset) private readonly files: Repository<FileAsset>,
    private readonly config: ConfigService,
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
  }

  async upload(userId: string, file: Express.Multer.File, visibility: 'PUBLIC' | 'PRIVATE' = 'PRIVATE') {
    this.validateFile(file);
    const checksumSha256 = createHash('sha256').update(file.buffer).digest('hex');
    const duplicate = await this.files.findOne({ where: { ownerUserId: userId, checksumSha256 } });
    if (duplicate) return this.withAccessUrl(duplicate);

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

  async get(user: AuthUser, id: string) {
    const asset = await this.files.findOne({ where: { id } });
    if (!asset) throw new NotFoundException('File not found');
    if (
      asset.visibility !== 'PUBLIC' &&
      asset.ownerUserId !== user.id &&
      ![UserRole.ADMIN, UserRole.SUPPORT].includes(user.role)
    ) {
      throw new ForbiddenException('You do not have access to this file');
    }
    return this.withAccessUrl(asset);
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
    return { deleted: true };
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
      scanningConfigured,
      productionReady:
        this.config.get<string>('NODE_ENV') !== 'production' ||
        (this.cloudinaryEnabled && scanningConfigured),
      maxFileSizeBytes: Number(this.config.get<string>('MAX_FILE_SIZE_BYTES') ?? 15 * 1024 * 1024),
    };
  }

  private async uploadCloudinary(
    userId: string,
    file: Express.Multer.File,
    visibility: 'PUBLIC' | 'PRIVATE',
    checksumSha256: string,
  ) {
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
    const asset = await this.files.save(
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
    return this.withAccessUrl(asset);
  }

  private async uploadLocal(
    userId: string,
    file: Express.Multer.File,
    visibility: 'PUBLIC' | 'PRIVATE',
    checksumSha256: string,
  ) {
    await mkdir(this.storagePath, { recursive: true });
    const extension = extname(file.originalname)
      .replace(/[^.a-zA-Z0-9]/g, '')
      .slice(0, 10);
    const storageKey = `${randomUUID()}${extension}`;
    await writeFile(resolve(this.storagePath, storageKey), file.buffer);
    const base = (this.config.get<string>('PUBLIC_BASE_URL') ?? '').replace(/\/$/, '');
    const asset = await this.files.save(
      this.files.create({
        ownerUserId: userId,
        storageKey,
        originalName: file.originalname,
        mimeType: file.mimetype,
        sizeBytes: file.size,
        url: `${base}/uploads/${storageKey}`,
        storageProvider: 'LOCAL',
        checksumSha256,
        visibility,
      }),
    );
    return this.withAccessUrl(asset);
  }

  private withAccessUrl(asset: FileAsset) {
    let accessUrl = asset.url;
    if (asset.storageProvider === 'CLOUDINARY' && asset.visibility === 'PRIVATE' && asset.providerPublicId) {
      accessUrl = cloudinary.url(asset.providerPublicId, {
        secure: true,
        sign_url: true,
        type: this.text(asset.metadata?.deliveryType) ?? 'authenticated',
        resource_type: this.text(asset.metadata?.resourceType) ?? 'image',
        expires_at: Math.floor(Date.now() / 1000) + 15 * 60,
      });
    }
    return { ...asset, accessUrl };
  }

  private validateFile(file: Express.Multer.File) {
    if (!file?.buffer?.length) throw new BadRequestException('A non-empty file is required');
    const maxBytes = Number(this.config.get<string>('MAX_FILE_SIZE_BYTES') ?? 15 * 1024 * 1024);
    if (file.size > maxBytes) throw new BadRequestException(`File exceeds ${maxBytes} bytes`);
    const allowed = (
      this.config.get<string>('ALLOWED_UPLOAD_MIME_TYPES') ??
      'image/jpeg,image/png,image/webp,application/pdf,video/mp4'
    )
      .split(',')
      .map((item) => item.trim().toLowerCase());
    if (!allowed.includes(file.mimetype.toLowerCase())) {
      throw new BadRequestException(`Unsupported file type: ${file.mimetype}`);
    }
  }

  private text(value: unknown): string | undefined {
    return typeof value === 'string' ? value : undefined;
  }
}
