import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, LessThan, Repository } from 'typeorm';
import { UniversalDispatchOffer, UniversalServiceRequest } from '../domain/universal-dispatch.entities';
import { UniversalOfferStatus, UniversalRequestStatus } from '../domain/universal-dispatch.enums';
import { UniversalDispatchStateMachineService } from '../application/universal-dispatch-state-machine.service';

@Injectable()
export class OfferExpiryWorker {
  private readonly logger = new Logger(OfferExpiryWorker.name);

  constructor(
    @InjectRepository(UniversalDispatchOffer)
    private readonly offers: Repository<UniversalDispatchOffer>,
    @InjectRepository(UniversalServiceRequest)
    private readonly requests: Repository<UniversalServiceRequest>,
    private readonly dataSource: DataSource,
    private readonly stateMachine: UniversalDispatchStateMachineService,
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
      await this.dataSource.transaction(async (manager) => {
        offer.respondedAt = new Date();
        await this.stateMachine.transitionOffer(manager, offer, UniversalOfferStatus.EXPIRED, {
          reasonCode: 'OFFER_EXPIRED',
        });
      });

      const request = await this.requests.findOne({ where: { id: offer.requestId } });
      if (
        request &&
        request.status === UniversalRequestStatus.OFFERING &&
        request.nextMatchAt &&
        request.nextMatchAt <= new Date()
      ) {
        request.nextMatchAt = new Date();
        await this.dataSource.transaction(async (manager) =>
          this.stateMachine.transitionRequest(manager, request, UniversalRequestStatus.SEARCHING, {
            reasonCode: 'OFFER_WAVE_EXPIRED',
          }),
        );
      }
    }
  }
}
