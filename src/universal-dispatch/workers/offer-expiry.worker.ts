import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import { UniversalDispatchOffer, UniversalServiceRequest } from '../domain/universal-dispatch.entities';
import { UniversalOfferStatus, UniversalRequestStatus } from '../domain/universal-dispatch.enums';

@Injectable()
export class OfferExpiryWorker {
  private readonly logger = new Logger(OfferExpiryWorker.name);

  constructor(
    @InjectRepository(UniversalDispatchOffer)
    private readonly offers: Repository<UniversalDispatchOffer>,
    @InjectRepository(UniversalServiceRequest)
    private readonly requests: Repository<UniversalServiceRequest>,
  ) {}

  @Cron(CronExpression.EVERY_10_SECONDS)
  async run(): Promise<void> {
    const expired = await this.offers.find({
      where: {
        status: UniversalOfferStatus.PENDING,
        expiresAt: LessThan(new Date()),
      },
      take: 200,
    });

    for (const offer of expired) {
      offer.status = UniversalOfferStatus.EXPIRED;
      offer.respondedAt = new Date();
      await this.offers.save(offer);

      const request = await this.requests.findOne({ where: { id: offer.requestId } });
      if (
        request &&
        request.status === UniversalRequestStatus.OFFERING &&
        request.nextMatchAt &&
        request.nextMatchAt <= new Date()
      ) {
        request.status = UniversalRequestStatus.SEARCHING;
        request.nextMatchAt = new Date();
        await this.requests.save(request);
      }
    }
  }
}
