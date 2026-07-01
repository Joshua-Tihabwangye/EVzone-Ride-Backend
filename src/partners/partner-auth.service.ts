import { Injectable, UnauthorizedException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { createHash } from 'node:crypto';
import { Partner, PartnerApiKey } from '../database/entities';
import { PartnerContext } from './partner-adapter.interface';

@Injectable()
export class PartnerAuthService {
  private readonly apiKeys = () => this.db.getRepository(PartnerApiKey);
  private readonly partners = () => this.db.getRepository(Partner);

  constructor(private readonly db: DataSource) {}

  async validateKey(headerKey: string): Promise<PartnerContext> {
    if (!headerKey || headerKey.length < 16) {
      throw new UnauthorizedException('Invalid partner API key');
    }
    const keyHash = createHash('sha256').update(headerKey).digest('hex');
    const key = await this.apiKeys().findOne({ where: { keyHash, status: 'ACTIVE' } });
    if (!key) throw new UnauthorizedException('Invalid partner API key');
    if (key.expiresAt && key.expiresAt <= new Date()) {
      throw new UnauthorizedException('Partner API key has expired');
    }
    const partner = await this.partners().findOne({ where: { id: key.partnerId } });
    if (!partner || partner.status !== 'ACTIVE') {
      throw new UnauthorizedException('Partner is not active');
    }
    await this.apiKeys().update(key.id, { lastUsedAt: new Date() });
    return {
      partnerId: partner.id,
      partnerType: partner.type,
      scopes: key.scopes,
      organizationId: partner.config?.organizationId as string | undefined,
    };
  }
}
