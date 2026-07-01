import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  BookingStatus,
  DriverAvailabilityStatus,
  PaymentMethod,
  ServiceType,
  UserRole,
  VehicleStatus,
} from '../common/enums';
import { AuthUser } from '../common/interfaces';
import { DriverProfile, TourPackage, TouristBooking, User, Vehicle } from '../database/entities';
import { DriversService } from '../drivers/drivers.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PaymentsService } from '../payments/payments.service';
import { PricingService } from '../pricing/pricing.service';
import {
  CreateTouristBookingDto,
  CreateTourPackageDto,
  TouristActionDto,
  TouristQuoteDto,
} from './tourist.dto';

@Injectable()
export class TouristService {
  constructor(
    @InjectRepository(TourPackage) private readonly packages: Repository<TourPackage>,
    @InjectRepository(TouristBooking) private readonly bookings: Repository<TouristBooking>,
    @InjectRepository(Vehicle) private readonly vehicles: Repository<Vehicle>,
    @InjectRepository(DriverProfile) private readonly driverProfiles: Repository<DriverProfile>,
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly pricing: PricingService,
    private readonly drivers: DriversService,
    private readonly notifications: NotificationsService,
    private readonly payments: PaymentsService,
    private readonly events: EventEmitter2,
  ) {}

  listPackages(city?: string) {
    const query = this.packages
      .createQueryBuilder('package')
      .where('package.active = :active', { active: true });
    if (city) query.andWhere('LOWER(package.city) = LOWER(:city)', { city });
    return query.orderBy('package.createdAt', 'DESC').getMany();
  }

  async package(id: string) {
    const item = await this.packages.findOne({ where: { id, active: true } });
    if (!item) throw new NotFoundException('Tour package not found');
    return item;
  }

  createPackage(operatorUserId: string, dto: CreateTourPackageDto) {
    return this.packages.save(
      this.packages.create({ operatorUserId, currency: 'UGX', active: true, ...dto }),
    );
  }

  async updatePackage(
    operatorUserId: string,
    id: string,
    dto: Partial<CreateTourPackageDto>,
    isAdmin = false,
  ) {
    const item = await this.packages.findOne({ where: { id } });
    if (!item) throw new NotFoundException('Tour package not found');
    if (!isAdmin && item.operatorUserId !== operatorUserId)
      throw new ForbiddenException('You do not manage this tour package');
    Object.assign(item, dto);
    return this.packages.save(item);
  }

  async quote(userId: string | undefined, dto: TouristQuoteDto) {
    if (dto.tourPackageId) {
      const item = await this.package(dto.tourPackageId);
      const passengerFactor = Math.max(1, Math.ceil((dto.passengers ?? 1) / 6));
      return {
        serviceType: ServiceType.TOURIST_VEHICLE,
        currency: item.currency,
        total: item.basePrice * passengerFactor,
        package: item,
        breakdown: { packageBasePrice: item.basePrice, vehicleCount: passengerFactor },
      };
    }
    const days = dto.durationDays ?? 1;
    const distanceKm = dto.distanceKm ?? 50;
    const quote = await this.pricing.quote(
      {
        serviceType: ServiceType.TOURIST_VEHICLE,
        vehicleType: dto.vehicleType,
        distanceKm,
        durationMinutes: days * 8 * 60,
        promoCode: dto.promoCode,
        extras: { extraDay: Math.max(0, days - 1) },
      },
      userId,
    );
    return quote;
  }

  async create(customerId: string, dto: CreateTouristBookingDto, organizationId?: string) {
    const startAt = new Date(dto.startAt);
    const endAt = new Date(dto.endAt);
    if (startAt <= new Date() || endAt <= startAt) throw new BadRequestException('Tour dates are invalid');
    const quote = await this.quote(customerId, dto);
    const packageItem = dto.tourPackageId ? await this.package(dto.tourPackageId) : null;
    const booking = await this.bookings.save(
      this.bookings.create({
        customerId,
        organizationId,
        operatorUserId: packageItem?.operatorUserId,
        tourPackageId: dto.tourPackageId,
        status: BookingStatus.REQUESTED,
        startAt,
        endAt,
        pickupAddress: dto.pickupAddress,
        pickupLatitude: dto.pickupLatitude,
        pickupLongitude: dto.pickupLongitude,
        dropoffAddress: dto.dropoffAddress,
        passengers: dto.passengers ?? 1,
        guideLanguage: dto.guideLanguage,
        itinerary: dto.itinerary ?? packageItem?.itinerary,
        preferences: dto.preferences,
        estimatedAmount: Number((quote as any).total),
        currency: (quote as any).currency ?? 'UGX',
        paymentMethod: dto.paymentMethod,
      }),
    );
    if (booking.operatorUserId) {
      await this.notifications.create({
        userId: booking.operatorUserId,
        title: 'New tourist vehicle booking',
        body: `${booking.passengers} guest(s) requested a tour vehicle.`,
        data: { bookingId: booking.id },
      });
    } else {
      const nearby = await this.drivers.nearby(
        ServiceType.TOURIST_VEHICLE,
        dto.pickupLatitude,
        dto.pickupLongitude,
        80,
      );
      for (const item of nearby.slice(0, 5)) {
        await this.notifications.create({
          userId: item.driver.userId,
          title: 'Tourist vehicle request',
          body: 'A new tourist transport booking is available.',
          data: { bookingId: booking.id },
        });
      }
    }
    this.emit(booking);
    return booking;
  }

  async list(user: AuthUser, page = 1, limit = 20) {
    const driver =
      user.role === UserRole.DRIVER
        ? await this.driverProfiles.findOne({ where: { userId: user.id } })
        : null;
    const query = this.bookings.createQueryBuilder('booking');
    if (driver) query.where('booking.driverId = :driverId', { driverId: driver.id });
    else if (user.role === UserRole.TOUR_OPERATOR)
      query.where('booking.operatorUserId = :userId', { userId: user.id });
    else query.where('booking.customerId = :userId', { userId: user.id });
    query
      .orderBy('booking.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);
    const [items, total] = await query.getManyAndCount();
    return { items, meta: { page, limit, total, pageCount: Math.ceil(total / limit) } };
  }

  async detail(user: AuthUser, id: string) {
    const booking = await this.get(id);
    await this.assertAccess(user, booking);
    const [vehicle, driver] = await Promise.all([
      booking.vehicleId ? this.vehicles.findOne({ where: { id: booking.vehicleId } }) : null,
      booking.driverId ? this.driverProfiles.findOne({ where: { id: booking.driverId } }) : null,
    ]);
    const driverUser = driver ? await this.users.findOne({ where: { id: driver.userId } }) : null;
    return { booking, vehicle, driver: driver ? { profile: driver, user: driverUser } : null };
  }

  async accept(user: AuthUser, id: string, vehicleId?: string) {
    const booking = await this.get(id);
    if (booking.status !== BookingStatus.REQUESTED)
      throw new BadRequestException('Booking is no longer awaiting acceptance');
    let driver: DriverProfile | null = null;
    if (user.role === UserRole.DRIVER) {
      driver = await this.drivers.getByUserId(user.id);
      vehicleId ??= driver.currentVehicleId;
    } else if (![UserRole.TOUR_OPERATOR, UserRole.ADMIN].includes(user.role)) {
      throw new ForbiddenException('Only drivers and tour operators can accept this booking');
    }
    if (user.role === UserRole.TOUR_OPERATOR && booking.operatorUserId !== user.id)
      throw new ForbiddenException('Booking belongs to another operator');
    const vehicle = vehicleId
      ? await this.vehicles.findOne({ where: { id: vehicleId, status: VehicleStatus.ACTIVE } })
      : await this.vehicles.findOne({
          where: { ownerUserId: booking.operatorUserId, status: VehicleStatus.ACTIVE, isActive: true },
        });
    if (!vehicle?.serviceCapabilities?.includes(ServiceType.TOURIST_VEHICLE))
      throw new BadRequestException('Eligible tourist vehicle is required');
    driver ??= vehicle.assignedDriverId
      ? await this.driverProfiles.findOne({ where: { id: vehicle.assignedDriverId } })
      : null;
    if (!driver) throw new BadRequestException('Vehicle must have an assigned driver');
    booking.driverId = driver.id;
    booking.vehicleId = vehicle.id;
    booking.operatorUserId ??= vehicle.ownerUserId;
    booking.status = BookingStatus.DRIVER_EN_ROUTE;
    await this.bookings.save(booking);
    driver.availabilityStatus = DriverAvailabilityStatus.BUSY;
    await this.driverProfiles.save(driver);
    await this.notifications.create({
      userId: booking.customerId,
      title: 'Tourist vehicle confirmed',
      body: 'Your vehicle and driver are confirmed.',
      data: { bookingId: booking.id },
    });
    this.emit(booking);
    return booking;
  }

  async transitionDriver(
    userId: string,
    id: string,
    action: 'arrive' | 'start' | 'complete',
    dto?: TouristActionDto,
  ) {
    const driver = await this.drivers.getByUserId(userId);
    const booking = await this.get(id);
    if (booking.driverId !== driver.id)
      throw new ForbiddenException('Booking is not assigned to this driver');
    const allowed: Record<typeof action, BookingStatus[]> = {
      arrive: [BookingStatus.DRIVER_EN_ROUTE],
      start: [BookingStatus.ARRIVED],
      complete: [BookingStatus.IN_PROGRESS],
    };
    if (!allowed[action].includes(booking.status))
      throw new BadRequestException(`Cannot ${action} booking in ${booking.status}`);
    booking.status =
      action === 'arrive'
        ? BookingStatus.ARRIVED
        : action === 'start'
          ? BookingStatus.IN_PROGRESS
          : BookingStatus.COMPLETED;
    if (action === 'complete') {
      booking.finalAmount = dto?.finalAmount ?? booking.estimatedAmount;
      driver.availabilityStatus = DriverAvailabilityStatus.ONLINE;
      await this.driverProfiles.save(driver);
    }
    await this.bookings.save(booking);
    this.emit(booking);
    if (action === 'complete' && booking.paymentMethod === PaymentMethod.EVZONE_WALLET) {
      try {
        const payment = await this.payments.createIntent(booking.customerId, {
          serviceType: ServiceType.TOURIST_VEHICLE,
          serviceId: booking.id,
          method: booking.paymentMethod,
          idempotencyKey: `tour-complete-${booking.id}`,
        });
        await this.payments.confirm(booking.customerId, payment.id);
      } catch {
        // Payment remains pending and can be retried through the payments API.
      }
    }
    return booking;
  }

  async cancel(user: AuthUser, id: string, dto: TouristActionDto) {
    const booking = await this.get(id);
    await this.assertAccess(user, booking);
    if (
      [BookingStatus.IN_PROGRESS, BookingStatus.COMPLETED, BookingStatus.CANCELLED].includes(booking.status)
    )
      throw new BadRequestException('Booking cannot be cancelled now');
    booking.status = BookingStatus.CANCELLED;
    booking.cancellationReason = dto.reason ?? 'Cancelled';
    await this.bookings.save(booking);
    if (booking.driverId)
      await this.driverProfiles.update(booking.driverId, {
        availabilityStatus: DriverAvailabilityStatus.ONLINE,
      });
    this.emit(booking);
    return booking;
  }

  private async get(id: string) {
    const booking = await this.bookings.findOne({ where: { id } });
    if (!booking) throw new NotFoundException('Tourist booking not found');
    return booking;
  }

  private async assertAccess(user: AuthUser, booking: TouristBooking) {
    if ([UserRole.ADMIN, UserRole.SUPPORT, UserRole.DISPATCHER].includes(user.role)) return;
    if (booking.customerId === user.id || booking.operatorUserId === user.id) return;
    if (user.role === UserRole.DRIVER) {
      const driver = await this.driverProfiles.findOne({ where: { userId: user.id } });
      if (driver?.id === booking.driverId) return;
    }
    throw new ForbiddenException('You do not have access to this booking');
  }

  private emit(booking: TouristBooking) {
    this.events.emit('service.updated', {
      serviceType: ServiceType.TOURIST_VEHICLE,
      serviceId: booking.id,
      data: booking,
    });
    this.events.emit('user.event', { userId: booking.customerId, event: 'tourist.updated', data: booking });
  }
}
