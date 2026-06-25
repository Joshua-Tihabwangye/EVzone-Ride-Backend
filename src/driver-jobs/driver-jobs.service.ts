import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AmbulanceService } from '../ambulance/ambulance.service';
import { MatchingJobStatus, OfferStatus, ServiceType } from '../common/enums';
import { AuthUser } from '../common/interfaces';
import { JobOffer, MatchingJob } from '../database/entities';
import { DeliveriesService } from '../deliveries/deliveries.service';
import { DriversService } from '../drivers/drivers.service';
import { MatchingService } from '../matching/matching.service';
import { RidesService } from '../rides/rides.service';
import { TouristService } from '../tourist/tourist.service';
import { AcceptDriverJobDto, DeclineDriverJobDto } from './driver-jobs.dto';

@Injectable()
export class DriverJobsService {
  constructor(
    @InjectRepository(JobOffer) private readonly offers: Repository<JobOffer>,
    @InjectRepository(MatchingJob) private readonly jobs: Repository<MatchingJob>,
    private readonly drivers: DriversService,
    private readonly matching: MatchingService,
    private readonly rides: RidesService,
    private readonly deliveries: DeliveriesService,
    private readonly tourist: TouristService,
    private readonly ambulance: AmbulanceService,
  ) {}

  async listOffers(userId: string, serviceType?: ServiceType) {
    const items = await this.matching.listOffersForDriver(userId, serviceType);
    return {
      items: items.map(({ offer, job }) => this.normalized(offer, job ?? undefined)),
      serverTime: new Date(),
    };
  }

  async active(userId: string) {
    const driver = await this.drivers.getByUserId(userId);
    const jobs = await this.jobs.find({
      where: { assignedDriverId: driver.id, status: MatchingJobStatus.ASSIGNED },
      order: { updatedAt: 'DESC' },
    });
    return {
      items: jobs.map((job) => this.normalized(undefined, job)),
      serverTime: new Date(),
    };
  }

  async detail(userId: string, offerId: string) {
    const driver = await this.drivers.getByUserId(userId);
    const offer = await this.offers.findOne({ where: { id: offerId, driverId: driver.id } });
    if (!offer) throw new NotFoundException('Driver job offer not found');
    const job = await this.jobs.findOne({ where: { id: offer.jobId } });
    if (!job) throw new NotFoundException('Driver job not found');
    return this.normalized(offer, job);
  }

  async accept(user: AuthUser, offerId: string, dto: AcceptDriverJobDto) {
    const { offer, job } = await this.resolvePending(user.id, offerId);
    let assignment: unknown;
    switch (job.serviceType) {
      case ServiceType.RIDE:
        assignment = await this.rides.accept(user.id, job.serviceId);
        break;
      case ServiceType.DELIVERY:
        assignment = await this.deliveries.driverAccept(user.id, job.serviceId);
        break;
      case ServiceType.TOURIST_VEHICLE:
        assignment = await this.tourist.accept(user, job.serviceId, dto.vehicleId);
        break;
      case ServiceType.AMBULANCE:
        assignment = await this.ambulance.driverAccept(user.id, job.serviceId);
        break;
      case ServiceType.CAR_RENTAL:
      case ServiceType.SCHOOL_SHUTTLE:
        assignment = await this.matching.claim(user.id, job.serviceType, job.serviceId);
        break;
      default:
        throw new BadRequestException('Unsupported driver job type');
    }
    const currentOffer = await this.offers.findOne({ where: { id: offer.id } });
    const currentJob = await this.jobs.findOne({ where: { id: job.id } });
    return {
      accepted: true,
      job: this.normalized(currentOffer ?? offer, currentJob ?? job),
      assignment,
    };
  }

  async decline(userId: string, offerId: string, dto: DeclineDriverJobDto) {
    const { job } = await this.resolvePending(userId, offerId);
    switch (job.serviceType) {
      case ServiceType.RIDE:
        await this.rides.reject(userId, job.serviceId, dto.reason);
        break;
      case ServiceType.DELIVERY:
        await this.deliveries.driverReject(userId, job.serviceId, dto.reason);
        break;
      default:
        await this.matching.reject(userId, job.serviceType, job.serviceId, dto.reason);
        break;
    }
    return { declined: true, offerId, reason: dto.reason };
  }

  private async resolvePending(userId: string, offerId: string) {
    const driver = await this.drivers.getByUserId(userId);
    const offer = await this.offers.findOne({ where: { id: offerId, driverId: driver.id } });
    if (!offer) throw new NotFoundException('Driver job offer not found');
    if (offer.status !== OfferStatus.PENDING || offer.expiresAt <= new Date()) {
      throw new BadRequestException('Driver job offer is expired or unavailable');
    }
    const job = await this.jobs.findOne({ where: { id: offer.jobId } });
    if (!job) throw new NotFoundException('Driver job not found');
    if (
      [MatchingJobStatus.ASSIGNED, MatchingJobStatus.CANCELLED, MatchingJobStatus.EXHAUSTED].includes(
        job.status,
      )
    ) {
      throw new BadRequestException('Driver job is no longer available');
    }
    return { offer, job };
  }

  private normalized(offer: JobOffer | undefined, job: MatchingJob | undefined) {
    if (!job) return { offer, job: null };
    const metadata = job.metadata ?? {};
    return {
      id: offer?.id ?? job.id,
      offerId: offer?.id,
      matchingJobId: job.id,
      serviceType: job.serviceType,
      serviceId: job.serviceId,
      status: offer?.status ?? job.status,
      title: this.title(job.serviceType),
      pickup: {
        latitude: job.pickupLatitude,
        longitude: job.pickupLongitude,
        address: metadata.pickupAddress ?? metadata.pickupLocation,
      },
      destination: metadata.destination ?? metadata.dropoff ?? metadata.dropoffAddress,
      estimatedFare: metadata.estimatedFare ?? metadata.fare ?? metadata.amount,
      currency: metadata.currency ?? 'UGX',
      distanceToPickupMeters: offer?.distanceMeters,
      offeredAt: offer?.offeredAt,
      expiresAt: offer?.expiresAt ?? job.expiresAt,
      requiredCapabilities: job.requiredCapabilities ?? [],
      dispatchRound: offer?.dispatchRound ?? job.dispatchRound,
      metadata,
      offer,
      matchingJob: job,
    };
  }

  private title(serviceType: ServiceType) {
    const titles: Record<ServiceType, string> = {
      [ServiceType.RIDE]: 'Ride request',
      [ServiceType.DELIVERY]: 'Delivery request',
      [ServiceType.TOURIST_VEHICLE]: 'Tourist vehicle request',
      [ServiceType.AMBULANCE]: 'Ambulance dispatch',
      [ServiceType.CAR_RENTAL]: 'Car rental assignment',
      [ServiceType.SCHOOL_SHUTTLE]: 'School shuttle assignment',
    };
    return titles[serviceType];
  }
}
