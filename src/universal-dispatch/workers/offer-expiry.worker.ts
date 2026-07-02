import { Injectable, Logger, Optional } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import { WorkerHeartbeatService } from '../../infrastructure/worker-heartbeat.service';
import { ProcessRoleService } from '../../infrastructure/process-role.service';
import { UniversalDispatchOffer, UniversalServiceRequest } from '../domain/universal-dispatch.entities';
import { UniversalOfferStatus, UniversalRequestStatus } from '../domain/universal-dispatch.enums';

@Injectable()
export class OfferExpiryWorker {
  private readonly logger = new Logger(OfferExpiryWorker.name);
  private processing = false;

  constructor(
    @InjectRepository(UniversalDispatchOffer)
    private readonly offers: Repository<UniversalDispatchOffer>,
    @InjectRepository(UniversalServiceRequest)
    private readonly requests: Repository<UniversalServiceRequest>,
    private readonly roles: ProcessRoleService,
    @Optional() private readonly heartbeat?: WorkerHeartbeatService,
  ) {}

  @Cron(CronExpression.EVERY_10_SECONDS)
  async run(): Promise<void> {
    if (!this.roles.runsWorkers()) return;
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
    await this.heartbeat?.record('OfferExpiryWorker.run', 10);
  }
}
