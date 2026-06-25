import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import { UniversalServiceRequest } from '../domain/universal-dispatch.entities';
import { UniversalRequestStatus } from '../domain/universal-dispatch.enums';
import { UniversalMatchingService } from '../application/universal-matching.service';

@Injectable()
export class MatchingWorker {
  private readonly logger = new Logger(MatchingWorker.name);
  private processing = false;

  constructor(
    @InjectRepository(UniversalServiceRequest)
    private readonly requests: Repository<UniversalServiceRequest>,
    private readonly matching: UniversalMatchingService,
  ) {}

  @Cron(CronExpression.EVERY_5_SECONDS)
  async run(): Promise<void> {
    if (this.processing) return;
    this.processing = true;
    try {
      const pending = await this.requests.find({
        where: [
          { status: UniversalRequestStatus.SEARCHING },
          {
            status: UniversalRequestStatus.OFFERING,
            nextMatchAt: LessThan(new Date()),
          },
        ],
        take: 50,
        order: { createdAt: 'ASC' },
      });
      for (const request of pending) {
        try {
          await this.matching.matchRequest(request.id);
        } catch (error) {
          this.logger.warn(
            `Matching failed for request ${request.id}: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
      }
    } finally {
      this.processing = false;
    }
  }
}
