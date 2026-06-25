import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { In, LessThan, MoreThan, Repository } from 'typeorm';
import { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';
import { DriverAvailabilityStatus, MatchingJobStatus, OfferStatus, ServiceType } from '../common/enums';
import { DriverProfile, JobOffer, MatchingJob } from '../database/entities';
import { DriversService } from '../drivers/drivers.service';
import { RedisService } from '../infrastructure/redis.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateMatchingJobDto } from './matching.dto';

@Injectable()
export class MatchingService {
  constructor(
    @InjectRepository(MatchingJob) private readonly jobs: Repository<MatchingJob>,
    @InjectRepository(JobOffer) private readonly offers: Repository<JobOffer>,
    @InjectRepository(DriverProfile) private readonly driverProfiles: Repository<DriverProfile>,
    private readonly drivers: DriversService,
    private readonly notifications: NotificationsService,
    private readonly redis: RedisService,
    private readonly events: EventEmitter2,
  ) {}

  async enqueue(input: CreateMatchingJobDto) {
    let job = await this.jobs.findOne({
      where: { serviceType: input.serviceType, serviceId: input.serviceId },
    });
    if (job?.status === MatchingJobStatus.ASSIGNED) return job;
    const now = new Date();
    if (!job) {
      job = this.jobs.create({
        ...input,
        status: MatchingJobStatus.QUEUED,
        currentRadiusMeters: input.currentRadiusMeters ?? Number(process.env.MATCH_INITIAL_RADIUS_M ?? 3000),
        maxRadiusMeters: input.maxRadiusMeters ?? Number(process.env.MATCH_MAX_RADIUS_M ?? 40000),
        radiusStepMeters: input.radiusStepMeters ?? Number(process.env.MATCH_RADIUS_STEP_M ?? 3000),
        concurrentOfferLimit: input.concurrentOfferLimit ?? Number(process.env.MATCH_CONCURRENT_OFFERS ?? 5),
        expiresAt: new Date(Date.now() + Number(process.env.MATCH_JOB_TTL_SECONDS ?? 900) * 1000),
        nextDispatchAt: now,
      });
    } else {
      Object.assign(job, input, {
        status: MatchingJobStatus.QUEUED,
        assignedDriverId: undefined,
        exhaustedAt: undefined,
        nextDispatchAt: now,
        expiresAt: new Date(Date.now() + Number(process.env.MATCH_JOB_TTL_SECONDS ?? 900) * 1000),
      });
    }
    job = await this.jobs.save(job);
    await this.publish('matching.job.queued', job, { job });
    void this.dispatch(job.id);
    return job;
  }

  async dispatch(jobId: string) {
    const lockKey = `matching:dispatch:${jobId}`;
    const locked = await this.redis.setIfAbsent(lockKey, randomUUID(), 15);
    if (!locked) return { dispatched: false, reason: 'LOCKED' };
    try {
      let job = await this.jobs.findOne({ where: { id: jobId } });
      if (!job || this.isInactive(job.status)) {
        return { dispatched: false, reason: 'INACTIVE' };
      }
      const now = new Date();
      if (job.expiresAt && job.expiresAt <= now) return this.exhaust(job, 'JOB_EXPIRED');

      await this.expireOffers(job.id, now);
      const activeCount = await this.offers.count({
        where: { jobId: job.id, status: OfferStatus.PENDING, expiresAt: MoreThan(now) },
      });
      const capacity = Math.max(0, job.concurrentOfferLimit - activeCount);
      if (!capacity) {
        const waiting = await this.transition(
          job.id,
          {
            status: MatchingJobStatus.WAITING,
            nextDispatchAt: new Date(
              Date.now() + Number(process.env.MATCH_RETRY_INTERVAL_SECONDS ?? 10) * 1000,
            ),
          },
          [MatchingJobStatus.QUEUED, MatchingJobStatus.WAITING, MatchingJobStatus.DISPATCHING],
        );
        if (!waiting) return { dispatched: false, reason: 'INACTIVE' };
        return { dispatched: false, reason: 'ACTIVE_OFFERS' };
      }

      job = await this.transition(
        job.id,
        {
          status: MatchingJobStatus.DISPATCHING,
          dispatchRound: job.dispatchRound + 1,
        },
        [MatchingJobStatus.QUEUED, MatchingJobStatus.WAITING, MatchingJobStatus.DISPATCHING],
      );
      if (!job) return { dispatched: false, reason: 'INACTIVE' };

      const prior = await this.offers.find({ where: { jobId: job.id } });
      const excluded = new Set(prior.map((offer) => offer.driverId));
      const nearby = await this.drivers.nearby(
        job.serviceType,
        job.pickupLatitude,
        job.pickupLongitude,
        job.currentRadiusMeters / 1000,
      );
      const candidates = nearby
        .filter((candidate) => !excluded.has(candidate.driver.id))
        .filter((candidate) => candidate.driver.availabilityStatus === DriverAvailabilityStatus.ONLINE)
        .slice(0, capacity);

      if (!candidates.length) {
        if (job.currentRadiusMeters >= job.maxRadiusMeters) {
          return this.exhaust(job, 'NO_DRIVER_AVAILABLE');
        }
        const radiusMeters = Math.min(job.maxRadiusMeters, job.currentRadiusMeters + job.radiusStepMeters);
        const queued = await this.transition(
          job.id,
          {
            status: MatchingJobStatus.QUEUED,
            currentRadiusMeters: radiusMeters,
            nextDispatchAt: new Date(
              Date.now() + Number(process.env.MATCH_RETRY_INTERVAL_SECONDS ?? 10) * 1000,
            ),
          },
          [MatchingJobStatus.DISPATCHING],
        );
        if (!queued) return { dispatched: false, reason: 'INACTIVE' };
        await this.publish('matching.radius.expanded', queued, {
          radiusMeters: queued.currentRadiusMeters,
          dispatchRound: queued.dispatchRound,
        });
        return {
          dispatched: false,
          reason: 'RADIUS_EXPANDED',
          radiusMeters: queued.currentRadiusMeters,
        };
      }

      const ttlSeconds = Number(process.env.MATCH_OFFER_TTL_SECONDS ?? 30);
      const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
      const created: JobOffer[] = [];
      for (const candidate of candidates) {
        const offer = await this.offers.save(
          this.offers.create({
            jobId: job.id,
            driverId: candidate.driver.id,
            offeredAt: now,
            expiresAt,
            distanceMeters: candidate.distanceKm * 1000,
            dispatchRound: job.dispatchRound,
            payload: {
              serviceType: job.serviceType,
              serviceId: job.serviceId,
              metadata: job.metadata,
            },
          }),
        );
        created.push(offer);
      }

      const waiting = await this.transition(
        job.id,
        { status: MatchingJobStatus.WAITING, nextDispatchAt: expiresAt },
        [MatchingJobStatus.DISPATCHING],
      );
      if (!waiting) {
        if (created.length) {
          await this.offers.update(
            { id: In(created.map((offer) => offer.id)) },
            { status: OfferStatus.CANCELLED, respondedAt: new Date() },
          );
        }
        return { dispatched: false, reason: 'INACTIVE' };
      }

      for (const offer of created) {
        const candidate = candidates.find((item) => item.driver.id === offer.driverId);
        if (!candidate) continue;
        await this.notifications.create({
          userId: candidate.driver.userId,
          title: this.offerTitle(waiting.serviceType),
          body: `A request is ${candidate.distanceKm.toFixed(1)} km away.`,
          data: {
            matchingJobId: waiting.id,
            offerId: offer.id,
            serviceType: waiting.serviceType,
            serviceId: waiting.serviceId,
            expiresAt,
          },
        });
        this.events.emit('user.event', {
          userId: candidate.driver.userId,
          event: 'job.offer.new',
          data: { job: waiting, offer },
        });
      }
      await this.publish('matching.offers.created', waiting, {
        count: created.length,
        offerIds: created.map((offer) => offer.id),
        expiresAt,
      });
      return { dispatched: true, offers: created };
    } finally {
      await this.redis.delete(lockKey);
    }
  }

  async listOffersForDriver(userId: string, serviceType?: ServiceType) {
    const driver = await this.drivers.getByUserId(userId);
    const now = new Date();
    const query = this.offers
      .createQueryBuilder('offer')
      .innerJoin(MatchingJob, 'job', 'job.id = offer.jobId')
      .where('offer.driverId = :driverId', { driverId: driver.id })
      .andWhere('offer.status = :status', { status: OfferStatus.PENDING })
      .andWhere('offer.expiresAt > :now', { now });
    if (serviceType) query.andWhere('job.serviceType = :serviceType', { serviceType });
    const offers = await query.orderBy('offer.createdAt', 'DESC').getMany();
    const jobs = offers.length
      ? await this.jobs.find({ where: { id: In(offers.map((offer) => offer.jobId)) } })
      : [];
    return offers.map((offer) => ({
      offer,
      job: jobs.find((job) => job.id === offer.jobId),
    }));
  }

  async claim(userId: string, serviceType: ServiceType, serviceId: string) {
    const driver = await this.drivers.getByUserId(userId);
    const job = await this.jobs.findOne({ where: { serviceType, serviceId } });
    if (!job) throw new NotFoundException('Matching job not found');
    const now = new Date();
    const offer = await this.offers.findOne({
      where: {
        jobId: job.id,
        driverId: driver.id,
        status: OfferStatus.PENDING,
        expiresAt: MoreThan(now),
      },
    });
    if (!offer) throw new BadRequestException('Offer is expired or unavailable');
    const result = await this.jobs
      .createQueryBuilder()
      .update(MatchingJob)
      .set({
        status: MatchingJobStatus.ASSIGNED,
        assignedDriverId: driver.id,
        nextDispatchAt: undefined,
      })
      .where('id = :id', { id: job.id })
      .andWhere('status IN (:...statuses)', {
        statuses: [MatchingJobStatus.QUEUED, MatchingJobStatus.DISPATCHING, MatchingJobStatus.WAITING],
      })
      .execute();
    if (!result.affected) throw new BadRequestException('Request was already assigned');
    offer.status = OfferStatus.ACCEPTED;
    offer.respondedAt = now;
    await this.offers.save(offer);
    await this.offers
      .createQueryBuilder()
      .update(JobOffer)
      .set({ status: OfferStatus.EXPIRED, respondedAt: now })
      .where('jobId = :jobId', { jobId: job.id })
      .andWhere('id != :offerId', { offerId: offer.id })
      .andWhere('status = :status', { status: OfferStatus.PENDING })
      .execute();
    await this.publish('matching.job.assigned', job, { driverId: driver.id, offerId: offer.id });
    return { job: { ...job, status: MatchingJobStatus.ASSIGNED, assignedDriverId: driver.id }, offer };
  }

  async reject(userId: string, serviceType: ServiceType, serviceId: string, reason?: string) {
    const driver = await this.drivers.getByUserId(userId);
    const job = await this.jobs.findOne({ where: { serviceType, serviceId } });
    if (!job) throw new NotFoundException('Matching job not found');
    const offer = await this.offers.findOne({
      where: { jobId: job.id, driverId: driver.id, status: OfferStatus.PENDING },
    });
    if (!offer) throw new NotFoundException('Pending offer not found');
    offer.status = OfferStatus.REJECTED;
    offer.respondedAt = new Date();
    offer.payload = { ...(offer.payload ?? {}), rejectionReason: reason };
    await this.offers.save(offer);
    await this.publish('matching.offer.rejected', job, { driverId: driver.id, offerId: offer.id, reason });
    job.status = MatchingJobStatus.QUEUED;
    job.nextDispatchAt = new Date();
    await this.jobs.save(job);
    void this.dispatch(job.id);
    return { rejected: true };
  }

  async cancel(serviceType: ServiceType, serviceId: string, reason = 'SERVICE_CANCELLED') {
    const job = await this.jobs.findOne({ where: { serviceType, serviceId } });
    if (!job) return { cancelled: false };
    await this.jobs
      .createQueryBuilder()
      .update(MatchingJob)
      .set({
        status: MatchingJobStatus.CANCELLED,
        metadata: { ...(job.metadata ?? {}), cancellationReason: reason },
      })
      .where('id = :id', { id: job.id })
      .execute();
    await this.offers.update(
      { jobId: job.id, status: OfferStatus.PENDING },
      { status: OfferStatus.CANCELLED, respondedAt: new Date() },
    );
    const cancelled = await this.jobs.findOne({ where: { id: job.id } });
    if (cancelled) await this.publish('matching.job.cancelled', cancelled, { reason });
    return { cancelled: true };
  }

  listJobs(status?: MatchingJobStatus, limit = 100) {
    return this.jobs.find({
      where: status ? { status } : {},
      order: { createdAt: 'DESC' },
      take: Math.min(limit, 500),
    });
  }

  async jobDetail(id: string) {
    const job = await this.jobs.findOne({ where: { id } });
    if (!job) throw new NotFoundException('Matching job not found');
    return {
      job,
      offers: await this.offers.find({ where: { jobId: id }, order: { offeredAt: 'DESC' } }),
    };
  }

  @Cron('*/5 * * * * *')
  async processQueue() {
    const now = new Date();
    const due = await this.jobs.find({
      where: [
        { status: MatchingJobStatus.QUEUED, nextDispatchAt: LessThan(now) },
        { status: MatchingJobStatus.WAITING, nextDispatchAt: LessThan(now) },
      ],
      take: 50,
    });
    for (const job of due) void this.dispatch(job.id);
  }

  private async transition(
    jobId: string,
    changes: QueryDeepPartialEntity<MatchingJob>,
    allowedStatuses: MatchingJobStatus[],
  ): Promise<MatchingJob | null> {
    const result = await this.jobs
      .createQueryBuilder()
      .update(MatchingJob)
      .set(changes)
      .where('id = :jobId', { jobId })
      .andWhere('status IN (:...allowedStatuses)', { allowedStatuses })
      .execute();
    if (!result.affected) return null;
    return this.jobs.findOne({ where: { id: jobId } });
  }

  private isInactive(status: MatchingJobStatus): boolean {
    return [MatchingJobStatus.ASSIGNED, MatchingJobStatus.CANCELLED, MatchingJobStatus.EXHAUSTED].includes(
      status,
    );
  }

  private async expireOffers(jobId: string, now: Date) {
    await this.offers
      .createQueryBuilder()
      .update(JobOffer)
      .set({ status: OfferStatus.EXPIRED, respondedAt: now })
      .where('jobId = :jobId', { jobId })
      .andWhere('status = :status', { status: OfferStatus.PENDING })
      .andWhere('expiresAt <= :now', { now })
      .execute();
  }

  private async exhaust(job: MatchingJob, reason: string) {
    const exhausted = await this.transition(
      job.id,
      {
        status: MatchingJobStatus.EXHAUSTED,
        exhaustedAt: new Date(),
        metadata: { ...(job.metadata ?? {}), exhaustionReason: reason },
      },
      [MatchingJobStatus.QUEUED, MatchingJobStatus.WAITING, MatchingJobStatus.DISPATCHING],
    );
    if (!exhausted) return { dispatched: false, reason: 'INACTIVE' };
    await this.publish('matching.job.exhausted', exhausted, { reason });
    return { dispatched: false, reason };
  }

  private async publish(eventType: string, job: MatchingJob, payload: Record<string, unknown>) {
    const eventPayload = {
      jobId: job.id,
      serviceType: job.serviceType,
      serviceId: job.serviceId,
      ...payload,
    };
    this.events.emit('domain.event', {
      topic: 'matching',
      eventType,
      aggregateType: 'MatchingJob',
      aggregateId: job.id,
      eventKey: `${job.serviceType}:${job.serviceId}`,
      payload: eventPayload,
    });
    this.events.emit(eventType, eventPayload);
    this.events.emit('service.updated', {
      serviceType: job.serviceType,
      serviceId: job.serviceId,
      data: { event: eventType, ...payload },
    });
  }

  private offerTitle(serviceType: ServiceType): string {
    const names: Record<ServiceType, string> = {
      [ServiceType.RIDE]: 'New ride request',
      [ServiceType.DELIVERY]: 'New delivery request',
      [ServiceType.TOURIST_VEHICLE]: 'New tourist vehicle request',
      [ServiceType.AMBULANCE]: 'New ambulance dispatch request',
      [ServiceType.CAR_RENTAL]: 'New rental assignment',
      [ServiceType.SCHOOL_SHUTTLE]: 'New school shuttle assignment',
    };
    return names[serviceType];
  }
}
