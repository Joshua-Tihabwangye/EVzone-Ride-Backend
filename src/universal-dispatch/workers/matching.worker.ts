import { Injectable, Logger, Optional } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
<<<<<<< HEAD
=======
import { WorkerHeartbeatService } from '../../infrastructure/worker-heartbeat.service';
import { ProcessRoleService } from '../../infrastructure/process-role.service';
>>>>>>> origin/main
import { UniversalServiceRequest } from '../domain/universal-dispatch.entities';
import { UniversalRequestStatus } from '../domain/universal-dispatch.enums';
import { DispatchMatchProcessor } from './processors/dispatch-match.processor';

@Injectable()
export class MatchingWorker {
  private readonly logger = new Logger(MatchingWorker.name);
  private processing = false;

  constructor(
    @InjectRepository(UniversalServiceRequest)
    private readonly requests: Repository<UniversalServiceRequest>,
    private readonly processor: DispatchMatchProcessor,
<<<<<<< HEAD
=======
    private readonly matching: UniversalMatchingService,
    private readonly roles: ProcessRoleService,
    @Optional() private readonly heartbeat?: WorkerHeartbeatService,
>>>>>>> origin/main
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
        select: ['id', 'createdAt'],
        take: 50,
        order: { createdAt: 'ASC' },
      });

      for (const request of pending) {
        try {
          await this.processor.schedule(request.id);
        } catch (error) {
          this.logger.warn(
            `Failed to schedule matching for request ${request.id}: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
      }
    } finally {
      this.processing = false;
      await this.heartbeat?.record('MatchingWorker.run', 5);
    }
  }
}
