import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { In, LessThan, MoreThan, Repository } from 'typeorm';
import {
  BookingStatus,
  DriverAvailabilityStatus,
  OfferStatus,
  PaymentMethod,
  RideCategory,
  RideMode,
  ServiceType,
  StopStatus,
  StopType,
  TripType,
  UserRole,
  VehicleStatus,
  WalletTransactionType,
} from '../common/enums';
import { AuthUser } from '../common/interfaces';
import { DEFAULT_MATCH_RADIUS_KM, DEFAULT_OFFER_TTL_SECONDS, MAX_RIDE_STOPS } from '../common/constants';
import { estimatedMinutes, haversineKm } from '../common/utils/geo';
import { randomOtp, safeEqualHash, sha256 } from '../common/utils/security';
import { assertTransition } from '../common/utils/state-machine';
import {
  DriverProfile,
  Ride,
  RideEvent,
  RideFeedback,
  RideOffer,
  RidePassenger,
  RideStop,
  TripShare,
  User,
  Vehicle,
} from '../database/entities';
import { DriversService } from '../drivers/drivers.service';
import { MatchingService } from '../matching/matching.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PaymentsService } from '../payments/payments.service';
import { PricingService } from '../pricing/pricing.service';
import { WalletsService } from '../wallets/wallets.service';
import {
  AddSharedPassengerDto,
  CancelRideDto,
  CompleteRideDto,
  CreateRideDto,
  EstimateRideDto,
  RescheduleRideDto,
  RideFeedbackDto,
} from './rides.dto';

const RIDE_TRANSITIONS: Partial<Record<BookingStatus, readonly BookingStatus[]>> = {
  [BookingStatus.REQUESTED]: [BookingStatus.SEARCHING, BookingStatus.CANCELLED],
  [BookingStatus.SEARCHING]: [
    BookingStatus.OFFERED,
    BookingStatus.DRIVER_EN_ROUTE,
    BookingStatus.CANCELLED,
    BookingStatus.EXPIRED,
  ],
  [BookingStatus.OFFERED]: [
    BookingStatus.DRIVER_EN_ROUTE,
    BookingStatus.SEARCHING,
    BookingStatus.CANCELLED,
    BookingStatus.EXPIRED,
  ],
  [BookingStatus.ACCEPTED]: [BookingStatus.DRIVER_EN_ROUTE, BookingStatus.CANCELLED],
  [BookingStatus.DRIVER_EN_ROUTE]: [BookingStatus.ARRIVED, BookingStatus.CANCELLED],
  [BookingStatus.ARRIVED]: [
    BookingStatus.WAITING,
    BookingStatus.VERIFIED,
    BookingStatus.CANCELLED,
    BookingStatus.NO_SHOW,
  ],
  [BookingStatus.WAITING]: [BookingStatus.VERIFIED, BookingStatus.CANCELLED, BookingStatus.NO_SHOW],
  [BookingStatus.VERIFIED]: [BookingStatus.IN_PROGRESS, BookingStatus.CANCELLED],
  [BookingStatus.IN_PROGRESS]: [BookingStatus.COMPLETED, BookingStatus.CANCELLED],
};

@Injectable()
export class RidesService {
  constructor(
    @InjectRepository(Ride) private readonly rides: Repository<Ride>,
    @InjectRepository(RideStop) private readonly stops: Repository<RideStop>,
    @InjectRepository(RideOffer) private readonly offers: Repository<RideOffer>,
    @InjectRepository(RidePassenger) private readonly passengers: Repository<RidePassenger>,
    @InjectRepository(RideEvent) private readonly eventsRepository: Repository<RideEvent>,
    @InjectRepository(RideFeedback) private readonly feedback: Repository<RideFeedback>,
    @InjectRepository(TripShare) private readonly shares: Repository<TripShare>,
    @InjectRepository(DriverProfile) private readonly driverProfiles: Repository<DriverProfile>,
    @InjectRepository(Vehicle) private readonly vehicles: Repository<Vehicle>,
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly drivers: DriversService,
    private readonly matching: MatchingService,
    private readonly pricing: PricingService,
    private readonly notifications: NotificationsService,
    private readonly payments: PaymentsService,
    private readonly wallets: WalletsService,
    private readonly eventBus: EventEmitter2,
  ) {}

  async estimate(userId: string | undefined, dto: EstimateRideDto) {
    const route = this.routeMetrics(dto);
    return this.pricing.quote(
      {
        serviceType: ServiceType.RIDE,
        vehicleType: dto.vehicleType,
        distanceKm: route.distanceKm,
        durationMinutes: route.durationMinutes,
        promoCode: dto.promoCode,
        extras: dto.extras,
      },
      userId,
    );
  }

  async create(riderId: string, dto: CreateRideDto, organizationId?: string) {
    this.validateCreate(dto);
    const route = this.routeMetrics(dto);
    const quote = await this.estimate(riderId, dto);
    const scheduledAt = dto.scheduledAt ? new Date(dto.scheduledAt) : undefined;
    const futureScheduled = scheduledAt && scheduledAt.getTime() > Date.now() + 5 * 60 * 1000;
    const code = randomOtp();
    const ride = await this.rides.save(
      this.rides.create({
        riderId,
        organizationId,
        status: futureScheduled ? BookingStatus.REQUESTED : BookingStatus.SEARCHING,
        mode: dto.mode ?? (futureScheduled ? RideMode.SCHEDULED : RideMode.ON_DEMAND),
        category: dto.category ?? RideCategory.STANDARD,
        tripType: dto.tripType ?? TripType.ONE_WAY,
        passengerCount: dto.passengerCount ?? 1,
        scheduledAt,
        returnAt: dto.returnAt ? new Date(dto.returnAt) : undefined,
        estimatedDistanceKm: route.distanceKm,
        estimatedDurationMinutes: route.durationMinutes,
        estimatedFare: quote.total,
        currency: quote.currency,
        paymentMethod: dto.paymentMethod,
        beneficiaryContactId: dto.beneficiaryContactId,
        beneficiary: dto.beneficiary,
        preferences: dto.preferences,
        promoCode: dto.promoCode?.toUpperCase(),
        discountAmount: quote.discountAmount,
        verificationCodeHash: sha256(code),
        verificationCode: code,
        sharingEnabled: dto.sharingEnabled ?? dto.mode === RideMode.SHARED,
      }),
    );
    await this.saveStops(ride.id, dto);
    await this.passengers.save(
      this.passengers.create({
        rideId: ride.id,
        userId: riderId,
        role: 'MAIN',
        seatCount: dto.passengerCount ?? 1,
        fareShare: quote.total,
      }),
    );
    await this.log(ride.id, 'RIDE_CREATED', riderId, { quote, scheduledAt });
    await this.pricing.recordRedemption({
      code: dto.promoCode,
      userId: riderId,
      serviceType: ServiceType.RIDE,
      serviceId: ride.id,
      discountAmount: quote.discountAmount,
    });
    if (!futureScheduled) void this.match(ride.id);
    return { ...(await this.detailForUser(riderId, ride.id, UserRole.RIDER)), verificationCode: code };
  }

  async list(user: AuthUser, scope = 'all', page = 1, limit = 20) {
    const driver =
      user.role === UserRole.DRIVER
        ? await this.driverProfiles.findOne({ where: { userId: user.id } })
        : null;
    const query = this.rides.createQueryBuilder('ride');
    if (driver) query.where('ride.driverId = :driverId', { driverId: driver.id });
    else query.where('ride.riderId = :userId', { userId: user.id });
    if (scope === 'upcoming') {
      query.andWhere('ride.status IN (:...statuses)', {
        statuses: [
          BookingStatus.REQUESTED,
          BookingStatus.SEARCHING,
          BookingStatus.OFFERED,
          BookingStatus.DRIVER_EN_ROUTE,
        ],
      });
    } else if (scope === 'past') {
      query.andWhere('ride.status IN (:...statuses)', {
        statuses: [
          BookingStatus.COMPLETED,
          BookingStatus.CANCELLED,
          BookingStatus.REJECTED,
          BookingStatus.NO_SHOW,
          BookingStatus.EXPIRED,
        ],
      });
    } else if (scope === 'active') {
      query.andWhere('ride.status IN (:...statuses)', {
        statuses: [
          BookingStatus.DRIVER_EN_ROUTE,
          BookingStatus.ARRIVED,
          BookingStatus.WAITING,
          BookingStatus.VERIFIED,
          BookingStatus.IN_PROGRESS,
        ],
      });
    }
    query
      .orderBy('ride.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);
    const [items, total] = await query.getManyAndCount();
    return { items, meta: { page, limit, total, pageCount: Math.ceil(total / limit) } };
  }

  async detailForUser(userId: string, rideId: string, role: UserRole) {
    const rideQuery = this.rides.createQueryBuilder('ride').where('ride.id = :rideId', { rideId });
    if ([UserRole.RIDER, UserRole.CUSTOMER].includes(role)) rideQuery.addSelect('ride.verificationCode');
    const ride = await rideQuery.getOne();
    if (!ride) throw new NotFoundException('Ride not found');
    await this.assertAccess(userId, role, ride);
    const [stops, passengers, events, driver, vehicle, rider] = await Promise.all([
      this.stops.find({ where: { rideId }, order: { sequence: 'ASC' } }),
      this.passengers.find({ where: { rideId }, order: { createdAt: 'ASC' } }),
      this.eventsRepository.find({ where: { rideId }, order: { createdAt: 'ASC' } }),
      ride.driverId ? this.driverProfiles.findOne({ where: { id: ride.driverId } }) : null,
      ride.vehicleId ? this.vehicles.findOne({ where: { id: ride.vehicleId } }) : null,
      this.users.findOne({ where: { id: ride.riderId } }),
    ]);
    const driverUser = driver ? await this.users.findOne({ where: { id: driver.userId } }) : null;
    return {
      ride,
      stops,
      passengers,
      events,
      rider: rider ? this.safeUser(rider) : null,
      driver: driver ? { profile: driver, user: driverUser ? this.safeUser(driverUser) : null } : null,
      vehicle,
      ...(ride.riderId === userId ? { verificationCode: ride.verificationCode } : {}),
    };
  }

  async cancel(user: AuthUser, rideId: string, dto: CancelRideDto) {
    const ride = await this.getRide(rideId);
    await this.assertAccess(user.id, user.role, ride);
    if ([BookingStatus.COMPLETED, BookingStatus.CANCELLED].includes(ride.status)) {
      throw new BadRequestException(`Ride is already ${ride.status}`);
    }
    ride.status = BookingStatus.CANCELLED;
    ride.cancelledAt = new Date();
    ride.cancelledByUserId = user.id;
    ride.cancellationReason = [dto.reason, dto.comment].filter(Boolean).join(': ');
    await this.rides.save(ride);
    await this.offers.update(
      { rideId, status: OfferStatus.PENDING },
      { status: OfferStatus.CANCELLED, respondedAt: new Date() },
    );
    await this.matching.cancel(ServiceType.RIDE, rideId, 'RIDE_CANCELLED');
    await this.releaseDriver(ride.driverId);
    await this.log(ride.id, 'RIDE_CANCELLED', user.id, { reason: ride.cancellationReason });
    await this.notifyParties(ride, 'Ride cancelled', `Ride ${ride.id} was cancelled.`, user.id);
    this.emitRide(ride);
    return ride;
  }

  async reschedule(riderId: string, rideId: string, dto: RescheduleRideDto) {
    const ride = await this.getOwnedRide(riderId, rideId);
    if (![BookingStatus.REQUESTED, BookingStatus.SEARCHING, BookingStatus.OFFERED].includes(ride.status)) {
      throw new BadRequestException('Only unstarted rides can be rescheduled');
    }
    const scheduledAt = new Date(dto.scheduledAt);
    if (scheduledAt <= new Date()) throw new BadRequestException('Scheduled time must be in the future');
    if (dto.returnAt && new Date(dto.returnAt) <= scheduledAt)
      throw new BadRequestException('Return time must be after departure');
    ride.scheduledAt = scheduledAt;
    ride.returnAt = dto.returnAt ? new Date(dto.returnAt) : undefined;
    ride.mode = RideMode.SCHEDULED;
    ride.status = BookingStatus.REQUESTED;
    await this.rides.save(ride);
    await this.offers.update(
      { rideId, status: OfferStatus.PENDING },
      { status: OfferStatus.CANCELLED, respondedAt: new Date() },
    );
    await this.matching.cancel(ServiceType.RIDE, rideId, 'RIDE_RESCHEDULED');
    await this.log(ride.id, 'RIDE_RESCHEDULED', riderId, { scheduledAt, returnAt: ride.returnAt });
    this.emitRide(ride);
    return ride;
  }

  async driverRequests(userId: string) {
    const driver = await this.drivers.getByUserId(userId);
    const now = new Date();
    await this.offers
      .createQueryBuilder()
      .update(RideOffer)
      .set({ status: OfferStatus.EXPIRED, respondedAt: now })
      .where('driverId = :driverId', { driverId: driver.id })
      .andWhere('status = :status', { status: OfferStatus.PENDING })
      .andWhere('expiresAt < :now', { now })
      .execute();
    const legacyOffers = await this.offers.find({
      where: { driverId: driver.id, status: OfferStatus.PENDING, expiresAt: MoreThan(now) },
      order: { createdAt: 'DESC' },
    });
    const genericOffers = await this.matching.listOffersForDriver(userId, ServiceType.RIDE);
    const rideIds = [
      ...legacyOffers.map((offer) => offer.rideId),
      ...genericOffers.map((item) => item.job?.serviceId).filter((id): id is string => Boolean(id)),
    ];
    const uniqueRideIds = [...new Set(rideIds)];
    const rides = uniqueRideIds.length ? await this.rides.find({ where: { id: In(uniqueRideIds) } }) : [];
    const stopRows = uniqueRideIds.length
      ? await this.stops.find({
          where: { rideId: In(uniqueRideIds) },
          order: { sequence: 'ASC' },
        })
      : [];
    const legacy = legacyOffers.map((offer) => ({
      offer,
      matchingJob: null,
      source: 'LEGACY' as const,
      ride: rides.find((ride) => ride.id === offer.rideId),
      stops: stopRows.filter((stop) => stop.rideId === offer.rideId),
    }));
    const generic = genericOffers.map(({ offer, job }) => ({
      offer,
      matchingJob: job,
      source: 'MATCHING_ENGINE' as const,
      ride: job ? rides.find((ride) => ride.id === job.serviceId) : undefined,
      stops: job ? stopRows.filter((stop) => stop.rideId === job.serviceId) : [],
    }));
    const genericRideIds = new Set(generic.map((item) => item.ride?.id).filter(Boolean));
    return [...generic, ...legacy.filter((item) => !genericRideIds.has(item.ride?.id))];
  }

  async accept(userId: string, rideId: string) {
    const driver = await this.drivers.getByUserId(userId);
    const vehicleId = driver.currentVehicleId;
    if (!vehicleId) throw new BadRequestException('No active vehicle selected');

    return this.rides.manager.transaction(async (manager) => {
      const ride = await manager.findOne(Ride, {
        where: { id: rideId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!ride) throw new NotFoundException('Ride not found');
      if (![BookingStatus.SEARCHING, BookingStatus.OFFERED].includes(ride.status)) {
        throw new BadRequestException('Ride is no longer available');
      }

      const vehicle = await manager.findOne(Vehicle, {
        where: { id: vehicleId, status: VehicleStatus.ACTIVE },
        lock: { mode: 'pessimistic_write' },
      });
      if (!vehicle || !vehicle.serviceCapabilities?.includes(ServiceType.RIDE)) {
        throw new BadRequestException('Selected vehicle is not eligible for rides');
      }

      const legacyOffer = await manager.findOne(RideOffer, {
        where: { rideId, driverId: driver.id, status: OfferStatus.PENDING },
        lock: { mode: 'pessimistic_write' },
      });

      let claimedByMatchingEngine = false;
      try {
        await this.matching.claim(userId, ServiceType.RIDE, rideId);
        claimedByMatchingEngine = true;
      } catch (error) {
        if (!legacyOffer || legacyOffer.expiresAt <= new Date()) throw error;
      }

      ride.driverId = driver.id;
      ride.vehicleId = vehicle.id;
      ride.status = BookingStatus.DRIVER_EN_ROUTE;
      ride.acceptedAt = new Date();
      await manager.save(ride);

      if (legacyOffer) {
        legacyOffer.status = OfferStatus.ACCEPTED;
        legacyOffer.respondedAt = new Date();
        await manager.save(legacyOffer);
      }

      await manager.update(
        RideOffer,
        { rideId, status: OfferStatus.PENDING },
        { status: OfferStatus.EXPIRED, respondedAt: new Date() },
      );

      driver.availabilityStatus = DriverAvailabilityStatus.BUSY;
      await manager.save(driver);

      await this.log(ride.id, 'DRIVER_ACCEPTED', userId, {
        driverId: driver.id,
        vehicleId: vehicle.id,
        matchingEngine: claimedByMatchingEngine,
      });
      await this.notifications.create({
        userId: ride.riderId,
        title: 'Driver assigned',
        body: 'Your EVzone driver is on the way to the pickup location.',
        data: { rideId: ride.id, driverId: driver.id },
      });
      this.emitRide(ride);
      return this.detailForUser(userId, rideId, UserRole.DRIVER);
    });
  }

  async reject(userId: string, rideId: string, reason?: string) {
    const driver = await this.drivers.getByUserId(userId);
    const offer = await this.offers.findOne({
      where: { rideId, driverId: driver.id, status: OfferStatus.PENDING },
    });
    let matchingRejected = false;
    try {
      await this.matching.reject(userId, ServiceType.RIDE, rideId, reason);
      matchingRejected = true;
    } catch (error) {
      if (!offer) throw error;
    }
    if (offer) {
      offer.status = OfferStatus.REJECTED;
      offer.respondedAt = new Date();
      await this.offers.save(offer);
    }
    await this.log(rideId, 'DRIVER_REJECTED', userId, { reason });
    const pending = await this.offers.count({ where: { rideId, status: OfferStatus.PENDING } });
    if (!pending && !matchingRejected) {
      await this.rides.update(
        { id: rideId, status: BookingStatus.OFFERED },
        { status: BookingStatus.SEARCHING },
      );
      void this.match(rideId);
    }
    return { rejected: true };
  }

  async arrive(userId: string, rideId: string) {
    const { ride } = await this.assignedDriverRide(userId, rideId);
    assertTransition(ride.status, BookingStatus.ARRIVED, RIDE_TRANSITIONS);
    ride.status = BookingStatus.ARRIVED;
    ride.arrivedAt = new Date();
    await this.rides.save(ride);
    await this.log(ride.id, 'DRIVER_ARRIVED', userId);
    await this.notifications.create({
      userId: ride.riderId,
      title: 'Driver has arrived',
      body: 'Your driver is at the pickup point.',
      data: { rideId },
    });
    this.emitRide(ride);
    return ride;
  }

  async waiting(userId: string, rideId: string) {
    const { ride } = await this.assignedDriverRide(userId, rideId);
    assertTransition(ride.status, BookingStatus.WAITING, RIDE_TRANSITIONS);
    ride.status = BookingStatus.WAITING;
    await this.rides.save(ride);
    await this.log(ride.id, 'WAITING_FOR_RIDER', userId);
    this.emitRide(ride);
    return ride;
  }

  async verifyOtp(userId: string, rideId: string, code: string) {
    const { ride } = await this.assignedDriverRide(userId, rideId, true);
    if (![BookingStatus.ARRIVED, BookingStatus.WAITING].includes(ride.status)) {
      throw new BadRequestException('OTP can only be verified at pickup');
    }
    if (!safeEqualHash(code, ride.verificationCodeHash))
      throw new BadRequestException('Invalid verification code');
    ride.verificationPassed = true;
    ride.status = BookingStatus.VERIFIED;
    await this.rides.save(ride);
    await this.log(ride.id, 'RIDER_VERIFIED', userId);
    this.emitRide(ride);
    return { verified: true, ride };
  }

  async start(userId: string, rideId: string) {
    const { ride } = await this.assignedDriverRide(userId, rideId);
    if (!ride.verificationPassed) throw new BadRequestException('Rider verification must be completed');
    assertTransition(ride.status, BookingStatus.IN_PROGRESS, RIDE_TRANSITIONS);
    ride.status = BookingStatus.IN_PROGRESS;
    ride.startedAt = new Date();
    await this.rides.save(ride);
    await this.stops.update(
      { rideId, type: StopType.PICKUP },
      { status: StopStatus.COMPLETED, departedAt: new Date() },
    );
    await this.log(ride.id, 'RIDE_STARTED', userId);
    await this.notifications.create({
      userId: ride.riderId,
      title: 'Trip started',
      body: 'Your EVzone ride is now in progress.',
      data: { rideId },
    });
    this.emitRide(ride);
    return ride;
  }

  async complete(userId: string, rideId: string, dto: CompleteRideDto) {
    const { ride, driver } = await this.assignedDriverRide(userId, rideId);
    assertTransition(ride.status, BookingStatus.COMPLETED, RIDE_TRANSITIONS);
    const distanceKm = dto.actualDistanceKm ?? ride.estimatedDistanceKm;
    const durationMinutes = dto.actualDurationMinutes ?? ride.estimatedDurationMinutes;
    const quote = await this.pricing.quote({
      serviceType: ServiceType.RIDE,
      distanceKm,
      durationMinutes,
      extras: { waitingMinutes: dto.waitingMinutes ?? 0 },
    });
    ride.finalFare = quote.total + (dto.tolls ?? 0);
    ride.status = BookingStatus.COMPLETED;
    ride.completedAt = new Date();
    await this.rides.save(ride);
    await this.matching.cancel(ServiceType.RIDE, rideId, 'RIDE_COMPLETED');
    await this.stops.update(
      { rideId, type: StopType.DROPOFF },
      { status: StopStatus.COMPLETED, arrivedAt: new Date() },
    );
    driver.completedRides += 1;
    driver.availabilityStatus = DriverAvailabilityStatus.ONLINE;
    await this.driverProfiles.save(driver);
    await this.log(ride.id, 'RIDE_COMPLETED', userId, {
      distanceKm,
      durationMinutes,
      finalFare: ride.finalFare,
    });
    await this.notifications.create({
      userId: ride.riderId,
      title: 'Trip completed',
      body: `Your fare is UGX ${ride.finalFare.toLocaleString()}.`,
      data: { rideId },
    });
    this.emitRide(ride);
    if (ride.paymentMethod === PaymentMethod.EVZONE_WALLET) {
      try {
        const payment = await this.payments.createIntent(ride.riderId, {
          serviceType: ServiceType.RIDE,
          serviceId: ride.id,
          method: PaymentMethod.EVZONE_WALLET,
          idempotencyKey: `ride-complete-${ride.id}`,
        });
        await this.payments.confirm(ride.riderId, payment.id);
      } catch {
        // Payment remains pending and can be retried through /payments.
      }
    }
    return ride;
  }

  async noShow(userId: string, rideId: string, reason = 'Rider no-show') {
    const { ride, driver } = await this.assignedDriverRide(userId, rideId);
    if (![BookingStatus.ARRIVED, BookingStatus.WAITING].includes(ride.status)) {
      throw new BadRequestException('No-show is only available while waiting at pickup');
    }
    ride.status = BookingStatus.NO_SHOW;
    ride.cancelledAt = new Date();
    ride.cancellationReason = reason;
    await this.rides.save(ride);
    driver.availabilityStatus = DriverAvailabilityStatus.ONLINE;
    await this.driverProfiles.save(driver);
    await this.log(ride.id, 'RIDER_NO_SHOW', userId, { reason });
    this.emitRide(ride);
    return ride;
  }

  async changeDriver(riderId: string, rideId: string) {
    const ride = await this.getOwnedRide(riderId, rideId);
    if ([BookingStatus.VERIFIED, BookingStatus.IN_PROGRESS, BookingStatus.COMPLETED].includes(ride.status)) {
      throw new BadRequestException('Driver cannot be changed after rider verification');
    }
    await this.releaseDriver(ride.driverId);
    ride.driverId = undefined;
    ride.vehicleId = undefined;
    ride.status = BookingStatus.SEARCHING;
    await this.rides.save(ride);
    await this.offers.update({ rideId }, { status: OfferStatus.CANCELLED, respondedAt: new Date() });
    await this.matching.cancel(ServiceType.RIDE, rideId, 'DRIVER_CHANGE_REQUESTED');
    await this.log(ride.id, 'DRIVER_CHANGE_REQUESTED', riderId);
    void this.match(rideId);
    this.emitRide(ride);
    return ride;
  }

  async addSharedPassenger(riderId: string, rideId: string, dto: AddSharedPassengerDto) {
    const ride = await this.getOwnedRide(riderId, rideId);
    if (!ride.sharingEnabled) throw new BadRequestException('Ride sharing is not enabled');
    const usedSeats = await this.passengers
      .find({ where: { rideId } })
      .then((items) => items.reduce((sum, item) => sum + item.seatCount, 0));
    const seatCount = dto.seatCount ?? 1;
    const vehicle = ride.vehicleId ? await this.vehicles.findOne({ where: { id: ride.vehicleId } }) : null;
    if (vehicle && usedSeats + seatCount > vehicle.seats)
      throw new BadRequestException('Vehicle capacity exceeded');
    return this.passengers.save(
      this.passengers.create({
        rideId,
        userId: dto.userId,
        name: dto.name,
        phone: dto.phone,
        role: 'SHARED',
        seatCount,
        fareShare: dto.fareShare ?? 0,
      }),
    );
  }

  async createShare(riderId: string, rideId: string, recipients?: Record<string, unknown>[]) {
    await this.getOwnedRide(riderId, rideId);
    const token = randomUUID().replaceAll('-', '');
    return this.shares.save(
      this.shares.create({
        ownerUserId: riderId,
        serviceType: ServiceType.RIDE,
        serviceId: rideId,
        token,
        recipients,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        active: true,
      }),
    );
  }

  async publicShare(token: string) {
    const share = await this.shares.findOne({
      where: { token, active: true, expiresAt: MoreThan(new Date()) },
    });
    if (!share || share.serviceType !== ServiceType.RIDE)
      throw new NotFoundException('Shared trip link is invalid or expired');
    const ride = await this.getRide(share.serviceId);
    const stops = await this.stops.find({ where: { rideId: ride.id }, order: { sequence: 'ASC' } });
    const driver = ride.driverId ? await this.driverProfiles.findOne({ where: { id: ride.driverId } }) : null;
    const location =
      driver?.lastLatitude != null
        ? { latitude: driver.lastLatitude, longitude: driver.lastLongitude, updatedAt: driver.lastLocationAt }
        : null;
    return {
      ride: { id: ride.id, status: ride.status, startedAt: ride.startedAt, completedAt: ride.completedAt },
      stops,
      location,
    };
  }

  async submitFeedback(riderId: string, rideId: string, dto: RideFeedbackDto) {
    const ride = await this.getOwnedRide(riderId, rideId);
    if (ride.status !== BookingStatus.COMPLETED || !ride.driverId)
      throw new BadRequestException('Feedback is available after trip completion');
    if (await this.feedback.findOne({ where: { rideId } }))
      throw new BadRequestException('Feedback was already submitted');
    const record = await this.feedback.save(
      this.feedback.create({
        rideId,
        riderId,
        driverId: ride.driverId,
        rating: dto.rating,
        message: dto.message,
        tipAmount: dto.tipAmount ?? 0,
      }),
    );
    const driver = await this.driverProfiles.findOne({ where: { id: ride.driverId } });
    if (driver) {
      const total = driver.rating * driver.ratingsCount + dto.rating;
      driver.ratingsCount += 1;
      driver.rating = Math.round((total / driver.ratingsCount) * 100) / 100;
      await this.driverProfiles.save(driver);
      if ((dto.tipAmount ?? 0) > 0) {
        const reference = `TIP-${ride.id}`;
        await this.wallets.debit(riderId, dto.tipAmount!, WalletTransactionType.TIP, reference, 'Driver tip');
        await this.wallets.credit(
          driver.userId,
          dto.tipAmount!,
          WalletTransactionType.TIP,
          reference,
          'Ride tip',
        );
      }
    }
    return record;
  }

  async match(rideId: string) {
    const ride = await this.getRide(rideId);
    if (![BookingStatus.SEARCHING, BookingStatus.REQUESTED].includes(ride.status)) return { matched: false };
    const pickup = await this.stops.findOne({ where: { rideId, type: StopType.PICKUP } });
    if (!pickup) return { matched: false };
    const initialRadiusMeters = Math.max(
      250,
      Number(
        process.env.MATCH_INITIAL_RADIUS_M ??
          Number(process.env.MATCH_RADIUS_KM ?? DEFAULT_MATCH_RADIUS_KM) * 1000,
      ),
    );
    const job = await this.matching.enqueue({
      serviceType: ServiceType.RIDE,
      serviceId: ride.id,
      pickupLatitude: pickup.latitude,
      pickupLongitude: pickup.longitude,
      currentRadiusMeters: initialRadiusMeters,
      maxRadiusMeters: Number(process.env.MATCH_MAX_RADIUS_M ?? 40_000),
      radiusStepMeters: Number(process.env.MATCH_RADIUS_STEP_M ?? 3_000),
      concurrentOfferLimit: Number(process.env.MATCH_CONCURRENT_OFFERS ?? 5),
      metadata: {
        category: ride.category,
        tripType: ride.tripType,
        passengerCount: ride.passengerCount,
        estimatedFare: ride.estimatedFare,
        legacyOfferTtlSeconds: Number(process.env.OFFER_TTL_SECONDS ?? DEFAULT_OFFER_TTL_SECONDS),
      },
    });
    ride.status = BookingStatus.OFFERED;
    await this.rides.save(ride);
    await this.log(ride.id, 'MATCHING_JOB_QUEUED', undefined, { matchingJobId: job.id });
    this.emitRide(ride);
    return { matched: true, matchingJob: job };
  }

  @Cron('*/10 * * * * *')
  async processMatchingAndSchedules() {
    const now = new Date();
    const due = await this.rides.find({
      where: {
        status: BookingStatus.REQUESTED,
        scheduledAt: LessThan(new Date(now.getTime() + 15 * 60 * 1000)),
      },
      take: 20,
    });
    for (const ride of due) {
      ride.status = BookingStatus.SEARCHING;
      await this.rides.save(ride);
      void this.match(ride.id);
    }
    const searching = await this.rides.find({ where: { status: BookingStatus.SEARCHING }, take: 20 });
    for (const ride of searching) {
      const activeOffers = await this.offers.count({
        where: { rideId: ride.id, status: OfferStatus.PENDING, expiresAt: MoreThan(now) },
      });
      if (!activeOffers) void this.match(ride.id);
    }
  }

  private async assignedDriverRide(userId: string, rideId: string, includeCode = false) {
    const driver = await this.drivers.getByUserId(userId);
    const query = this.rides.createQueryBuilder('ride').where('ride.id = :rideId', { rideId });
    if (includeCode) query.addSelect('ride.verificationCodeHash');
    const ride = await query.getOne();
    if (!ride || ride.driverId !== driver.id)
      throw new ForbiddenException('Ride is not assigned to this driver');
    return { ride, driver };
  }

  private async getRide(id: string, includeCode = false) {
    const query = this.rides.createQueryBuilder('ride').where('ride.id = :id', { id });
    if (includeCode) query.addSelect(['ride.verificationCodeHash', 'ride.verificationCode']);
    const ride = await query.getOne();
    if (!ride) throw new NotFoundException('Ride not found');
    return ride;
  }

  private async getOwnedRide(riderId: string, id: string) {
    const ride = await this.rides.findOne({ where: { id, riderId } });
    if (!ride) throw new NotFoundException('Ride not found');
    return ride;
  }

  private async assertAccess(userId: string, role: UserRole, ride: Ride) {
    if ([UserRole.ADMIN, UserRole.SUPPORT, UserRole.DISPATCHER].includes(role)) return;
    if (ride.riderId === userId) return;
    if (role === UserRole.DRIVER) {
      const driver = await this.driverProfiles.findOne({ where: { userId } });
      if (driver && ride.driverId === driver.id) return;
    }
    throw new ForbiddenException('You do not have access to this ride');
  }

  private validateCreate(dto: CreateRideDto) {
    if ((dto.stops?.length ?? 0) > MAX_RIDE_STOPS)
      throw new BadRequestException(`Maximum ${MAX_RIDE_STOPS} stops allowed`);
    if (dto.tripType === TripType.ROUND_TRIP) {
      if (!dto.returnAt) throw new BadRequestException('Return time is required for round trips');
      const departure = dto.scheduledAt ? new Date(dto.scheduledAt) : new Date();
      if (new Date(dto.returnAt) <= departure)
        throw new BadRequestException('Return time must be after departure');
    }
    if (dto.scheduledAt && new Date(dto.scheduledAt) <= new Date())
      throw new BadRequestException('Scheduled time must be in the future');
  }

  private routeMetrics(dto: EstimateRideDto) {
    const points = [dto.pickup, ...(dto.stops ?? []), dto.destination];
    let distanceKm = 0;
    for (let i = 1; i < points.length; i += 1) {
      distanceKm += haversineKm(points[i - 1], points[i]);
    }
    if (dto.tripType === TripType.ROUND_TRIP) distanceKm *= 2;
    distanceKm = Math.max(0.5, Math.round(distanceKm * 1000) / 1000);
    return {
      distanceKm,
      durationMinutes: estimatedMinutes(distanceKm, dto.mode === RideMode.INTERCITY ? 55 : 32),
    };
  }

  private async saveStops(rideId: string, dto: CreateRideDto) {
    const rows = [
      this.stops.create({ rideId, sequence: 0, type: StopType.PICKUP, ...dto.pickup }),
      ...(dto.stops ?? []).map((stop, index) =>
        this.stops.create({ rideId, sequence: index + 1, type: StopType.STOP, ...stop }),
      ),
      this.stops.create({
        rideId,
        sequence: (dto.stops?.length ?? 0) + 1,
        type: StopType.DROPOFF,
        ...dto.destination,
      }),
    ];
    if (dto.tripType === TripType.ROUND_TRIP) {
      rows.push(this.stops.create({ rideId, sequence: rows.length, type: StopType.RETURN, ...dto.pickup }));
    }
    await this.stops.save(rows);
  }

  private async log(rideId: string, eventType: string, actorUserId?: string, data?: Record<string, unknown>) {
    await this.eventsRepository.save(this.eventsRepository.create({ rideId, eventType, actorUserId, data }));
  }

  private async releaseDriver(driverId?: string) {
    if (!driverId) return;
    await this.driverProfiles.update(driverId, { availabilityStatus: DriverAvailabilityStatus.ONLINE });
  }

  private async notifyParties(ride: Ride, title: string, body: string, exceptUserId?: string) {
    const userIds = [ride.riderId];
    if (ride.driverId) {
      const driver = await this.driverProfiles.findOne({ where: { id: ride.driverId } });
      if (driver) userIds.push(driver.userId);
    }
    for (const userId of [...new Set(userIds)].filter((id) => id !== exceptUserId)) {
      await this.notifications.create({ userId, title, body, data: { rideId: ride.id } });
    }
  }

  @OnEvent('matching.job.exhausted')
  async onMatchingExhausted(payload: { serviceType: ServiceType; serviceId: string; reason?: string }) {
    if (payload.serviceType !== ServiceType.RIDE) return;
    const ride = await this.rides.findOne({ where: { id: payload.serviceId } });
    if (
      !ride ||
      ![BookingStatus.REQUESTED, BookingStatus.SEARCHING, BookingStatus.OFFERED].includes(ride.status)
    ) {
      return;
    }
    ride.status = BookingStatus.EXPIRED;
    ride.cancelledAt = new Date();
    ride.cancellationReason = payload.reason ?? 'NO_DRIVER_AVAILABLE';
    await this.rides.save(ride);
    await this.log(ride.id, 'NO_DRIVER_AVAILABLE', undefined, { reason: ride.cancellationReason });
    await this.notifications.create({
      userId: ride.riderId,
      title: 'No driver available',
      body: 'No eligible driver was found for this request. You can retry or schedule the ride for later.',
      data: { rideId: ride.id, reason: ride.cancellationReason },
    });
    this.emitRide(ride);
  }

  private emitRide(ride: Ride) {
    this.eventBus.emit('domain.event', {
      topic: 'rides',
      eventType: 'ride.status.changed',
      aggregateType: 'Ride',
      aggregateId: ride.id,
      eventKey: ride.id,
      payload: {
        rideId: ride.id,
        riderId: ride.riderId,
        driverId: ride.driverId,
        vehicleId: ride.vehicleId,
        status: ride.status,
      },
    });
    this.eventBus.emit('service.updated', { serviceType: ServiceType.RIDE, serviceId: ride.id, data: ride });
    this.eventBus.emit('user.event', { userId: ride.riderId, event: 'ride.updated', data: ride });
  }

  private safeUser(user: User) {
    return {
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      avatarUrl: user.avatarUrl,
      rating: undefined,
    };
  }
}
