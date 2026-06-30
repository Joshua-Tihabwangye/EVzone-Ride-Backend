import { constants } from 'node:fs';
import { access } from 'node:fs/promises';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HealthCheckError, HealthIndicator, HealthIndicatorResult } from '@nestjs/terminus';

@Injectable()
export class StorageHealthIndicator extends HealthIndicator {
  constructor(private readonly config: ConfigService) {
    super();
  }

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    const cloudinaryDisabled =
      (this.config.get<string>('CLOUDINARY_DISABLED') ?? 'true').toLowerCase() === 'true';

    if (!cloudinaryDisabled) {
      const configured =
        Boolean(this.config.get<string>('CLOUDINARY_CLOUD_NAME')) &&
        Boolean(this.config.get<string>('CLOUDINARY_API_KEY')) &&
        Boolean(this.config.get<string>('CLOUDINARY_API_SECRET'));
      const result = this.getStatus(key, configured, {
        provider: 'CLOUDINARY',
        configured,
      });
      if (!configured) {
        throw new HealthCheckError('Cloudinary storage is not fully configured', result);
      }
      return result;
    }

    const storagePath = this.config.get<string>('STORAGE_PATH') ?? './storage';
    try {
      await access(storagePath, constants.W_OK);
      return this.getStatus(key, true, {
        provider: 'LOCAL',
        path: storagePath,
        writable: true,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new HealthCheckError(
        `Local storage is not writable: ${message}`,
        this.getStatus(key, false, {
          provider: 'LOCAL',
          path: storagePath,
          writable: false,
          message,
        }),
      );
    }
  }
}
