import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  InspectionType,
  PaymentMethod,
  RentalStatus,
  ServiceType,
  UserRole,
  VehicleStatus,
} from '../common/enums';
import { AuthUser } from '../common/interfaces';
import { RentalBlock, RentalBooking, RentalInspection, Vehicle } from '../database/entities';
import { NotificationsService } from '../notifications/notifications.service';
import { PaymentsService } from '../payments/payments.service';
import { VehiclesService } from '../vehicles/vehicles.service';
import {
  CreateRentalBookingDto,
  ExtendRentalDto,
  RentalActionDto,
  RentalInspectionDto,
  RentalQuoteDto,
  RentalSearchDto,
} from './rentals.dto';

@Injectable()
export class RentalsService {
  constructor(
    @InjectRepository(RentalBooking) private readonly bookings: Repository<RentalBooking>,
    @InjectRepository(RentalInspection) private readonly inspections: Repository<RentalInspection>,
    @InjectRepository(RentalBlock) private readonly blocks: Repository<RentalBlock>,
    @InjectRepository(Vehicle) private readonly vehiclesRepository: Repository<Vehicle>,
    private readonly vehicles: VehiclesService,
    private readonly notifications: NotificationsService,
    private readonly payments: PaymentsService,
    private readonly events: EventEmitter2,
  ) {}

  async search(dto: RentalSearchDto) {
    const pickupAt = new Date(dto.pickupAt);
    const returnAt = new Date(dto.returnAt);
    this.validateDates(pickupAt, returnAt);
    const vehicles = await this.vehiclesRepository.find({
      where: {
        status: VehicleStatus.ACTIVE,
        isActive: true,
        ...(dto.vehicleType ? { vehicleType: dto.vehicleType } : {}),
      },
      order: { dailyRentalRate: 'ASC' },
    });
    const eligible = vehicles.filter(
      (vehicle) =>
        vehicle.serviceCapabilities?.includes(ServiceType.CAR_RENTAL) &&
        (!dto.seats || vehicle.seats >= dto.seats),
    );
    const available: Vehicle[] = [];
    for (const vehicle of eligible) {
      if (await this.vehicles.isRentalAvailable(vehicle.id, pickupAt, returnAt)) available.push(vehicle);
    }
    return available;
  }

  async quote(dto: RentalQuoteDto) {
    const vehicle = await this.vehiclesRepository.findOne({
      where: { id: dto.vehicleId, status: VehicleStatus.ACTIVE },
    });
    if (!vehicle?.serviceCapabilities?.includes(ServiceType.CAR_RENTAL))
      throw new NotFoundException('Rental vehicle not found');
    const pickupAt = new Date(dto.pickupAt);
    const returnAt = new Date(dto.returnAt);
    this.validateDates(pickupAt, returnAt);
    if (!(await this.vehicles.isRentalAvailable(vehicle.id, pickupAt, returnAt)))
      throw new BadRequestException('Vehicle is not available for the selected period');
    const rentalDays = Math.max(1, Math.ceil((returnAt.getTime() - pickupAt.getTime()) / 86400000));
    const dailyRate = vehicle.dailyRentalRate ?? 200000;
    const driverCharge = dto.withDriver ? rentalDays * 100000 : 0;
    const subtotal = dailyRate * rentalDays + driverCharge;
    const depositAmount = Math.round(subtotal * 0.25);
    return {
      vehicle,
      rentalDays,
      dailyRate,
      driverCharge,
      depositAmount,
      estimatedAmount: subtotal + depositAmount,
      currency: 'UGX',
      includedDailyKm: vehicle.includedDailyKm ?? 200,
      extraKmRate: vehicle.extraKmRate ?? 1500,
    };
  }

  async create(renterId: string, dto: CreateRentalBookingDto) {
    if (!dto.agreementAccepted) throw new BadRequestException('Rental agreement must be accepted');
    const quote = await this.quote(dto);
    const booking = await this.bookings.save(
      this.bookings.create({
        renterId,
        vehicleId: dto.vehicleId,
        ownerUserId: quote.vehicle.ownerUserId,
        status: RentalStatus.REQUESTED,
        pickupAt: new Date(dto.pickupAt),
        returnAt: new Date(dto.returnAt),
        pickupLocation: dto.pickupLocation,
        returnLocation: dto.returnLocation,
        withDriver: dto.withDriver ?? false,
        dailyRate: quote.dailyRate,
        depositAmount: quote.depositAmount,
        estimatedAmount: quote.estimatedAmount,
        paymentMethod: dto.paymentMethod,
        mileageLimitKm: quote.includedDailyKm * quote.rentalDays,
        extraKmRate: quote.extraKmRate,
        agreementAcceptedAt: new Date(),
      }),
    );
    await this.notifications.create({
      userId: booking.ownerUserId,
      title: 'New rental booking request',
      body: `${quote.vehicle.make} ${quote.vehicle.model} was requested for ${quote.rentalDays} day(s).`,
      data: { bookingId: booking.id },
    });
    this.emit(booking);
    return booking;
  }

  async list(user: AuthUser, page = 1, limit = 20) {
    const query = this.bookings.createQueryBuilder('booking');
    if ([UserRole.RENTAL_PARTNER, UserRole.ADMIN].includes(user.role)) {
      if (user.role === UserRole.RENTAL_PARTNER)
        query.where('booking.ownerUserId = :userId', { userId: user.id });
      else query.where('1=1');
    } else query.where('booking.renterId = :userId', { userId: user.id });
    query
      .orderBy('booking.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);
    const [items, total] = await query.getManyAndCount();
    return { items, meta: { page, limit, total, pageCount: Math.ceil(total / limit) } };
  }

  async detail(user: AuthUser, id: string) {
    const booking = await this.get(id);
    this.assertAccess(user, booking);
    const [vehicle, inspections] = await Promise.all([
      this.vehiclesRepository.findOne({ where: { id: booking.vehicleId } }),
      this.inspections.find({ where: { bookingId: id }, order: { createdAt: 'ASC' } }),
    ]);
    return { booking, vehicle, inspections };
  }

  async ownerAction(user: AuthUser, id: string, accept: boolean, dto?: RentalActionDto) {
    const booking = await this.get(id);
    if (user.role !== UserRole.ADMIN && booking.ownerUserId !== user.id)
      throw new ForbiddenException('You do not own this rental vehicle');
    if (booking.status !== RentalStatus.REQUESTED)
      throw new BadRequestException('Booking is no longer awaiting confirmation');
    if (!accept) {
      booking.status = RentalStatus.REJECTED;
      booking.cancellationReason = dto?.reason ?? 'Rejected by rental partner';
      await this.bookings.save(booking);
      this.emit(booking);
      return booking;
    }
    if (!(await this.vehicles.isRentalAvailable(booking.vehicleId, booking.pickupAt, booking.returnAt))) {
      throw new BadRequestException('Vehicle is no longer available');
    }
    booking.status = RentalStatus.CONFIRMED;
    await this.bookings.save(booking);
    await this.blocks.save(
      this.blocks.create({
        vehicleId: booking.vehicleId,
        startsAt: booking.pickupAt,
        endsAt: booking.returnAt,
        reason: 'RENTAL_BOOKING',
        bookingId: booking.id,
      }),
    );
    await this.notifications.create({
      userId: booking.renterId,
      title: 'Rental confirmed',
      body: 'Your EVzone rental is confirmed.',
      data: { bookingId: booking.id },
    });
    this.emit(booking);
    return booking;
  }

  async inspect(user: AuthUser, id: string, dto: RentalInspectionDto) {
    const booking = await this.get(id);
    this.assertAccess(user, booking);
    if (
      dto.type === InspectionType.PICKUP &&
      ![RentalStatus.CONFIRMED, RentalStatus.PICKUP_INSPECTION].includes(booking.status)
    ) {
      throw new BadRequestException('Pickup inspection is not available');
    }
    if (
      dto.type === InspectionType.RETURN &&
      ![RentalStatus.ACTIVE, RentalStatus.RETURN_INSPECTION].includes(booking.status)
    ) {
      throw new BadRequestException('Return inspection is not available');
    }
    const inspection = await this.inspections.save(
      this.inspections.create({
        bookingId: id,
        inspectorUserId: user.id,
        type: dto.type,
        odometerKm: dto.odometerKm,
        fuelOrChargePercent: dto.fuelOrChargePercent,
        photos: dto.photos,
        damages: dto.damages,
        notes: dto.notes,
        signedAt: new Date(),
      }),
    );
    booking.status =
      dto.type === InspectionType.PICKUP ? RentalStatus.ACTIVE : RentalStatus.RETURN_INSPECTION;
    await this.bookings.save(booking);
    this.emit(booking);
    if (dto.type === InspectionType.PICKUP && booking.paymentMethod === PaymentMethod.EVZONE_WALLET) {
      try {
        const payment = await this.payments.createIntent(booking.renterId, {
          serviceType: ServiceType.CAR_RENTAL,
          serviceId: booking.id,
          method: booking.paymentMethod,
          idempotencyKey: `rental-start-${booking.id}`,
        });
        await this.payments.confirm(booking.renterId, payment.id);
      } catch {
        // Payment remains pending and can be retried through the payments API.
      }
    }
    return { inspection, booking };
  }

  async extend(renterId: string, id: string, dto: ExtendRentalDto) {
    const booking = await this.bookings.findOne({ where: { id, renterId } });
    if (!booking) throw new NotFoundException('Rental booking not found');
    if (![RentalStatus.CONFIRMED, RentalStatus.ACTIVE].includes(booking.status))
      throw new BadRequestException('Rental cannot be extended now');
    const newReturnAt = new Date(dto.returnAt);
    if (newReturnAt <= booking.returnAt) throw new BadRequestException('New return time must be later');
    const conflict = await this.blocks
      .createQueryBuilder('block')
      .where('block.vehicleId = :vehicleId', { vehicleId: booking.vehicleId })
      .andWhere('block.bookingId != :bookingId', { bookingId: booking.id })
      .andWhere('block.startsAt < :newReturnAt', { newReturnAt })
      .andWhere('block.endsAt > :currentReturnAt', { currentReturnAt: booking.returnAt })
      .getCount();
    if (conflict) throw new BadRequestException('Vehicle has another booking during the extension period');
    const extraDays = Math.ceil((newReturnAt.getTime() - booking.returnAt.getTime()) / 86400000);
    booking.returnAt = newReturnAt;
    booking.estimatedAmount += extraDays * booking.dailyRate;
    await this.bookings.save(booking);
    await this.blocks.update({ bookingId: booking.id }, { endsAt: newReturnAt });
    this.emit(booking);
    return booking;
  }

  async complete(user: AuthUser, id: string, dto: RentalActionDto) {
    const booking = await this.get(id);
    this.assertAccess(user, booking);
    if (booking.status !== RentalStatus.RETURN_INSPECTION)
      throw new BadRequestException('Return inspection must be completed first');
    const inspections = await this.inspections.find({ where: { bookingId: id } });
    const pickup = inspections.find((item) => item.type === InspectionType.PICKUP);
    const returned = inspections.find((item) => item.type === InspectionType.RETURN);
    const drivenKm = pickup && returned ? Math.max(0, returned.odometerKm - pickup.odometerKm) : 0;
    const excessKm = Math.max(0, drivenKm - booking.mileageLimitKm);
    booking.finalAmount = booking.estimatedAmount + excessKm * booking.extraKmRate + (dto.damageCharge ?? 0);
    booking.status = RentalStatus.COMPLETED;
    await this.bookings.save(booking);
    this.emit(booking);
    return {
      booking,
      drivenKm,
      excessKm,
      extraMileageCharge: excessKm * booking.extraKmRate,
      damageCharge: dto.damageCharge ?? 0,
    };
  }

  async cancel(user: AuthUser, id: string, dto: RentalActionDto) {
    const booking = await this.get(id);
    this.assertAccess(user, booking);
    if (
      [
        RentalStatus.ACTIVE,
        RentalStatus.RETURN_INSPECTION,
        RentalStatus.COMPLETED,
        RentalStatus.CANCELLED,
      ].includes(booking.status)
    ) {
      throw new BadRequestException('Rental cannot be cancelled now');
    }
    booking.status = RentalStatus.CANCELLED;
    booking.cancellationReason = dto.reason ?? 'Cancelled';
    await this.bookings.save(booking);
    await this.blocks.delete({ bookingId: booking.id });
    this.emit(booking);
    return booking;
  }

  private validateDates(pickupAt: Date, returnAt: Date) {
    if (pickupAt <= new Date() || returnAt <= pickupAt)
      throw new BadRequestException('Rental dates are invalid');
  }

  private async get(id: string) {
    const booking = await this.bookings.findOne({ where: { id } });
    if (!booking) throw new NotFoundException('Rental booking not found');
    return booking;
  }

  private assertAccess(user: AuthUser, booking: RentalBooking) {
    if ([UserRole.ADMIN, UserRole.SUPPORT].includes(user.role)) return;
    if (booking.renterId === user.id || booking.ownerUserId === user.id || booking.driverId === user.id)
      return;
    throw new ForbiddenException('You do not have access to this rental booking');
  }

  private emit(booking: RentalBooking) {
    this.events.emit('service.updated', {
      serviceType: ServiceType.CAR_RENTAL,
      serviceId: booking.id,
      data: booking,
    });
    this.events.emit('user.event', { userId: booking.renterId, event: 'rental.updated', data: booking });
  }
}
