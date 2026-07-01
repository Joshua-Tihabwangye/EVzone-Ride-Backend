import { InjectQueue, OnQueueEvent, Processor } from '@nestjs/bullmq';
import { Injectable, Logger, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, LessThan, Repository } from 'typeorm';
import { Queue, Job } from 'bullmq';
import { DISPATCH_EXPIRE_OFFERS_QUEUE, WorkerHealthService, DeadLetterService } from '../../../workers';
import { UniversalDispatchOffer, UniversalServiceRequest } from '../../domain/universal-dispatch.entities';
import { UniversalOfferStatus, UniversalRequestStatus } from '../../domain/universal-dispatch.enums';
import { UniversalDispatchStateMachineService } from '../../application/universal-dispatch-state-machine.service';

export interface ExpireOffersJob {
  batchSize?: number;
}

@Injectable()
@Processor(DISPATCH_EXPIRE_OFFERS_QUEUE)
export class DispatchExpireOffersProcessor {
  private readonly logger = new Logger(DispatchExpireOffersProcessor.name);

  constructor(
    @InjectRepository(UniversalDispatchOffer)
    private readonly offers: Repository<UniversalDispatchOffer>,
    @InjectRepository(UniversalServiceRequest)
    private readonly requests: Repository<UniversalServiceRequest>,
    private readonly dataSource: DataSource,
    private readonly stateMachine: UniversalDispatchStateMachineService,
    private readonly health: WorkerHealthService,
    private readonly deadLetter: DeadLetterService,
    @Optional() @InjectQueue(DISPATCH_EXPIRE_OFFERS_QUEUE) private readonly queue?: Queue,
  ) {}

  async process(job: Job<ExpireOffersJob>): Promise<void> {
    const batchSize = job.data.batchSize ?? 200;
    const expired = await this.offers.find({
      where: {
        status: UniversalOfferStatus.PENDING,
        expiresAt: LessThan(new Date()),
      },
      take: batchSize,
    });

    for (const offer of expired) {
      try {
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
      } catch (error) {
        this.logger.warn(
          `Expiry failed for offer ${offer.id}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }

  async schedule(): Promise<void> {
    if (this.queue) {
      await this.queue.add('expire-offers', {}, { jobId: `expire-offers:${Date.now()}` });
    } else {
      await this.process({ data: {} } as Job<ExpireOffersJob>);
    }
  }

  @OnQueueEvent('completed')
  onCompleted(): void {
    this.health.beat(DispatchExpireOffersProcessor.name, 'success');
  }

  @OnQueueEvent('failed')
  onFailed(job: Job<ExpireOffersJob>, error: Error): void {
    this.health.beat(DispatchExpireOffersProcessor.name, 'failure');
    void this.deadLetter.record(job, error);
  }
}
