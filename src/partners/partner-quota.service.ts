import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { PartnerQuotaUsage } from '../database/entities';
import { currentQuotaPeriod } from './partner.service';

@Injectable()
export class PartnerQuotaService {
  constructor(private readonly db: DataSource) {}

  async assertQuota(partnerId: string, metric: string, increment = 1): Promise<PartnerQuotaUsage> {
    const period = currentQuotaPeriod();
    const repo = this.db.getRepository(PartnerQuotaUsage);
    let row = await repo.findOne({ where: { partnerId, period, metric } });
    if (!row) {
      row = repo.create({ partnerId, period, metric, allowed: 0, used: 0 });
    }
    if (row.allowed > 0 && row.used + increment > row.allowed) {
      throw new HttpException(
        `Quota exceeded for ${metric} in period ${period}`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    row.used += increment;
    return repo.save(row);
  }
}
