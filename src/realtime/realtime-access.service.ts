import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  BookingStatus,
  DeliveryStatus,
  MembershipStatus,
  RentalStatus,
  ServiceType,
  UserRole,
} from '../common/enums';
import { JwtPayload } from '../common/interfaces';
import {
  AmbulanceRequest,
  DeliveryOrder,
  DriverProfile,
  FleetProfile,
  OrganizationMember,
  RentalBooking,
  Ride,
  SchoolFleetConnection,
  SchoolFleetResource,
  TouristBooking,
} from '../database/entities';

const TERMINAL_BOOKING_STATUSES = [
  BookingStatus.COMPLETED,
  BookingStatus.CANCELLED,
  BookingStatus.REJECTED,
  BookingStatus.EXPIRED,
  BookingStatus.NO_SHOW,
];

const TERMINAL_DELIVERY_STATUSES = [
  DeliveryStatus.COMPLETED,
  DeliveryStatus.CANCELLED,
  DeliveryStatus.REJECTED,
];

const TERMINAL_RENTAL_STATUSES = [RentalStatus.COMPLETED, RentalStatus.CANCELLED, RentalStatus.REJECTED];

@Injectable()
export class RealtimeAccessService {
  constructor(
    @InjectRepository(Ride) private readonly rides: Repository<Ride>,
    @InjectRepository(DeliveryOrder) private readonly deliveries: Repository<DeliveryOrder>,
    @InjectRepository(TouristBooking) private readonly touristBookings: Repository<TouristBooking>,
    @InjectRepository(AmbulanceRequest) private readonly ambulanceRequests: Repository<AmbulanceRequest>,
    @InjectRepository(RentalBooking) private readonly rentals: Repository<RentalBooking>,
    @InjectRepository(DriverProfile) private readonly drivers: Repository<DriverProfile>,
    @InjectRepository(SchoolFleetConnection)
    private readonly schoolConnections: Repository<SchoolFleetConnection>,
    @InjectRepository(SchoolFleetResource)
    private readonly schoolResources: Repository<SchoolFleetResource>,
    @InjectRepository(FleetProfile) private readonly fleets: Repository<FleetProfile>,
    @InjectRepository(OrganizationMember)
    private readonly organizationMembers: Repository<OrganizationMember>,
  ) {}

  async assertAccess(user: JwtPayload, serviceType: ServiceType, serviceId: string): Promise<void> {
    if (this.isOperationsRole(user.role)) return;
    const driverId = await this.driverId(user);
    const allowed = await this.canAccess(user, driverId, serviceType, serviceId);
    if (!allowed) throw new ForbiddenException('You do not have access to this realtime service room');
  }

  async activeRooms(user: JwtPayload): Promise<string[]> {
    if (this.isOperationsRole(user.role)) return [];
    const driverId = await this.driverId(user);
    const identities: Array<{ serviceType: ServiceType; serviceId: string }> = [];

    const rideQuery = this.rides
      .createQueryBuilder('ride')
      .select('ride.id', 'id')
      .where('ride.status NOT IN (:...terminal)', { terminal: TERMINAL_BOOKING_STATUSES });
    if (driverId) {
      rideQuery.andWhere('(ride.riderId = :userId OR ride.driverId = :driverId)', {
        userId: user.sub,
        driverId,
      });
    } else {
      rideQuery.andWhere('ride.riderId = :userId', { userId: user.sub });
    }
    for (const row of await rideQuery.limit(25).getRawMany<{ id: string }>()) {
      identities.push({ serviceType: ServiceType.RIDE, serviceId: row.id });
    }

    const deliveryQuery = this.deliveries
      .createQueryBuilder('delivery')
      .select('delivery.id', 'id')
      .where('delivery.status NOT IN (:...terminal)', { terminal: TERMINAL_DELIVERY_STATUSES });
    if (driverId) {
      deliveryQuery.andWhere('(delivery.customerId = :userId OR delivery.driverId = :driverId)', {
        userId: user.sub,
        driverId,
      });
    } else {
      deliveryQuery.andWhere('delivery.customerId = :userId', { userId: user.sub });
    }
    for (const row of await deliveryQuery.limit(25).getRawMany<{ id: string }>()) {
      identities.push({ serviceType: ServiceType.DELIVERY, serviceId: row.id });
    }

    const touristQuery = this.touristBookings
      .createQueryBuilder('booking')
      .select('booking.id', 'id')
      .where('booking.status NOT IN (:...terminal)', { terminal: TERMINAL_BOOKING_STATUSES });
    const touristConditions = ['booking.customerId = :userId', 'booking.operatorUserId = :userId'];
    if (driverId) touristConditions.push('booking.driverId = :driverId');
    touristQuery.andWhere(`(${touristConditions.join(' OR ')})`, { userId: user.sub, driverId });
    for (const row of await touristQuery.limit(25).getRawMany<{ id: string }>()) {
      identities.push({ serviceType: ServiceType.TOURIST_VEHICLE, serviceId: row.id });
    }

    const ambulanceQuery = this.ambulanceRequests
      .createQueryBuilder('request')
      .select('request.id', 'id')
      .where('request.status NOT IN (:...terminal)', { terminal: TERMINAL_BOOKING_STATUSES });
    const ambulanceConditions = ['request.requesterId = :userId', 'request.dispatcherId = :userId'];
    if (driverId) ambulanceConditions.push('request.driverId = :driverId');
    ambulanceQuery.andWhere(`(${ambulanceConditions.join(' OR ')})`, { userId: user.sub, driverId });
    for (const row of await ambulanceQuery.limit(25).getRawMany<{ id: string }>()) {
      identities.push({ serviceType: ServiceType.AMBULANCE, serviceId: row.id });
    }

    const rentalQuery = this.rentals
      .createQueryBuilder('rental')
      .select('rental.id', 'id')
      .where('rental.status NOT IN (:...terminal)', { terminal: TERMINAL_RENTAL_STATUSES });
    const rentalConditions = ['rental.renterId = :userId', 'rental.ownerUserId = :userId'];
    if (driverId) rentalConditions.push('rental.driverId = :driverId');
    rentalQuery.andWhere(`(${rentalConditions.join(' OR ')})`, { userId: user.sub, driverId });
    for (const row of await rentalQuery.limit(25).getRawMany<{ id: string }>()) {
      identities.push({ serviceType: ServiceType.CAR_RENTAL, serviceId: row.id });
    }

    return [...new Set(identities.map((item) => this.room(item.serviceType, item.serviceId)))];
  }

  room(serviceType: ServiceType, serviceId: string): string {
    return `service:${serviceType}:${serviceId}`;
  }

  private async canAccess(
    user: JwtPayload,
    driverId: string | undefined,
    serviceType: ServiceType,
    serviceId: string,
  ): Promise<boolean> {
    switch (serviceType) {
      case ServiceType.RIDE: {
        const ride = await this.rides.findOne({ where: { id: serviceId } });
        if (!ride) throw new NotFoundException('Ride not found');
        return ride.riderId === user.sub || Boolean(driverId && ride.driverId === driverId);
      }
      case ServiceType.DELIVERY: {
        const order = await this.deliveries.findOne({ where: { id: serviceId } });
        if (!order) throw new NotFoundException('Delivery not found');
        const receiver = order.receiver as { userId?: string; phone?: string; email?: string };
        return (
          order.customerId === user.sub ||
          Boolean(driverId && order.driverId === driverId) ||
          receiver.userId === user.sub ||
          Boolean(user.phone && receiver.phone === user.phone) ||
          Boolean(user.email && receiver.email?.toLowerCase() === user.email.toLowerCase())
        );
      }
      case ServiceType.TOURIST_VEHICLE: {
        const booking = await this.touristBookings.findOne({ where: { id: serviceId } });
        if (!booking) throw new NotFoundException('Tourist booking not found');
        return (
          booking.customerId === user.sub ||
          booking.operatorUserId === user.sub ||
          Boolean(driverId && booking.driverId === driverId)
        );
      }
      case ServiceType.AMBULANCE: {
        const request = await this.ambulanceRequests.findOne({ where: { id: serviceId } });
        if (!request) throw new NotFoundException('Ambulance request not found');
        return (
          request.requesterId === user.sub ||
          request.dispatcherId === user.sub ||
          Boolean(driverId && request.driverId === driverId)
        );
      }
      case ServiceType.CAR_RENTAL: {
        const rental = await this.rentals.findOne({ where: { id: serviceId } });
        if (!rental) throw new NotFoundException('Rental booking not found');
        return (
          rental.renterId === user.sub ||
          rental.ownerUserId === user.sub ||
          Boolean(driverId && rental.driverId === driverId)
        );
      }
      case ServiceType.SCHOOL_SHUTTLE:
        return this.canAccessSchoolShuttle(user, serviceId);
      default:
        return false;
    }
  }

  private async canAccessSchoolShuttle(user: JwtPayload, serviceId: string): Promise<boolean> {
    if (![UserRole.FLEET_MANAGER, UserRole.FLEET_PARTNER].includes(user.role)) return false;

    const resource = await this.schoolResources.findOne({ where: { id: serviceId } });
    const connection = resource
      ? await this.schoolConnections.findOne({ where: { id: resource.connectionId } })
      : await this.schoolConnections.findOne({ where: { id: serviceId } });
    const fleetId = resource?.fleetId ?? connection?.fleetId;
    if (!fleetId) throw new NotFoundException('School shuttle realtime resource not found');

    const fleet = await this.fleets.findOne({ where: { id: fleetId } });
    if (!fleet) throw new NotFoundException('Fleet not found');
    const membership = await this.organizationMembers.findOne({
      where: {
        organizationId: fleet.organizationId,
        userId: user.sub,
        status: MembershipStatus.ACTIVE,
      },
    });
    return Boolean(membership);
  }

  private async driverId(user: JwtPayload): Promise<string | undefined> {
    if (user.role !== UserRole.DRIVER) return undefined;
    return this.drivers.findOne({ where: { userId: user.sub } }).then((driver) => driver?.id);
  }

  private isOperationsRole(role: UserRole): boolean {
    return [UserRole.ADMIN, UserRole.SUPPORT, UserRole.DISPATCHER].includes(role);
  }
}
