import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { randomBytes, randomUUID } from 'node:crypto';
import { In, Repository } from 'typeorm';
import {
  DeliveryServiceType,
  DeliveryStatus,
  DriverAvailabilityStatus,
  InvitationStatus,
  PackageSize,
  PaymentMethod,
  ServiceType,
  StopStatus,
  StopType,
  UserRole,
  VehicleStatus,
  WalletTransactionType,
} from '../common/enums';
import { AuthUser } from '../common/interfaces';
import { estimatedMinutes, haversineKm } from '../common/utils/geo';
import { randomOtp, safeEqualHash, sha256 } from '../common/utils/security';
import {
  DeliveryEvent,
  DeliveryFeedback,
  DeliveryItem,
  DeliveryOrder,
  DeliveryStop,
  DriverProfile,
  TrackingInvitation,
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
  CreateDeliveryDto,
  CreateTrackingInvitationDto,
  DeliveryActionDto,
  DeliveryFeedbackDto,
  EstimateDeliveryDto,
} from './deliveries.dto';

@Injectable()
export class DeliveriesService {
  constructor(
    @InjectRepository(DeliveryOrder) private readonly orders: Repository<DeliveryOrder>,
    @InjectRepository(DeliveryItem) private readonly items: Repository<DeliveryItem>,
    @InjectRepository(DeliveryStop) private readonly stops: Repository<DeliveryStop>,
    @InjectRepository(DeliveryEvent) private readonly events: Repository<DeliveryEvent>,
    @InjectRepository(TrackingInvitation) private readonly invitations: Repository<TrackingInvitation>,
    @InjectRepository(DeliveryFeedback) private readonly feedback: Repository<DeliveryFeedback>,
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

  async estimate(userId: string | undefined, dto: EstimateDeliveryDto) {
    const distanceKm = haversineKm(dto.pickup, dto.destination);
    const durationMinutes = estimatedMinutes(
      distanceKm,
      dto.serviceType === DeliveryServiceType.BIKE ? 25 : 35,
    );
    const extras = {
      fragile: dto.fragile ? 1 : 0,
      mediumBox: dto.packageSize === PackageSize.MEDIUM ? 1 : 0,
      largeBox: dto.packageSize === PackageSize.LARGE ? 1 : 0,
      weightBand: Math.max(0, Math.ceil(dto.weightKg / 10) - 1),
    };
    return this.pricing.quote(
      { serviceType: ServiceType.DELIVERY, distanceKm, durationMinutes, promoCode: dto.promoCode, extras },
      userId,
    );
  }

  async create(customerId: string, dto: CreateDeliveryDto) {
    if (dto.scheduledAt && new Date(dto.scheduledAt) <= new Date()) {
      throw new BadRequestException('Scheduled pickup must be in the future');
    }
    const quote = await this.estimate(customerId, dto);
    const trackingCode = `EVZ${Date.now().toString(36).toUpperCase()}${randomBytes(2).toString('hex').toUpperCase()}`;
    const qrToken = `EVZONE-DELIVERY-${randomUUID()}`;
    const dropoffCode = randomOtp().slice(0, 4);
    const requiresAcceptance = dto.receiver.requiresAcceptance === true;
    const order = await this.orders.save(
      this.orders.create({
        customerId,
        trackingCode,
        status: requiresAcceptance ? DeliveryStatus.WAITING_ACCEPTANCE : DeliveryStatus.ACCEPTED,
        serviceType: dto.serviceType,
        packageName: dto.packageName,
        description: dto.description,
        packageSize: dto.packageSize,
        weightKg: dto.weightKg,
        declaredValue: dto.declaredValue ?? 0,
        fragile: dto.fragile ?? false,
        scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : undefined,
        pickupAddress: dto.pickup.address,
        pickupLatitude: dto.pickup.latitude,
        pickupLongitude: dto.pickup.longitude,
        destinationAddress: dto.destination.address,
        destinationLatitude: dto.destination.latitude,
        destinationLongitude: dto.destination.longitude,
        sender: { ...dto.sender } as Record<string, unknown>,
        receiver: { ...dto.receiver } as Record<string, unknown>,
        estimatedDistanceKm: quote.distanceKm,
        estimatedDurationMinutes: quote.durationMinutes,
        estimatedCost: quote.total,
        paymentMethod: dto.paymentMethod,
        qrTokenHash: sha256(qrToken),
        qrToken,
        dropoffCodeHash: sha256(dropoffCode),
        dropoffCode,
      }),
    );
    if (dto.items?.length) {
      await this.items.save(
        dto.items.map((item) =>
          this.items.create({ orderId: order.id, ...item, unitWeightKg: item.unitWeightKg ?? 0 }),
        ),
      );
    }
    await this.stops.save([
      this.stops.create({
        orderId: order.id,
        sequence: 0,
        type: StopType.PICKUP,
        address: dto.pickup.address,
        latitude: dto.pickup.latitude,
        longitude: dto.pickup.longitude,
        contact: { ...dto.sender } as Record<string, unknown>,
      }),
      this.stops.create({
        orderId: order.id,
        sequence: 1,
        type: StopType.DROPOFF,
        address: dto.destination.address,
        latitude: dto.destination.latitude,
        longitude: dto.destination.longitude,
        contact: { ...dto.receiver } as Record<string, unknown>,
      }),
    ]);
    await this.log(order.id, 'DELIVERY_CREATED', customerId, { quote });
    await this.pricing.recordRedemption({
      code: dto.promoCode,
      userId: customerId,
      serviceType: ServiceType.DELIVERY,
      serviceId: order.id,
      discountAmount: quote.discountAmount,
    });
    if (requiresAcceptance && dto.receiver.userId) {
      await this.notifications.create({
        userId: dto.receiver.userId,
        title: 'Incoming delivery request',
        body: `${dto.sender.name} wants to send you ${dto.packageName}.`,
        data: { orderId: order.id, trackingCode },
      });
    } else {
      void this.enqueueMatching(order);
    }
    return {
      ...(await this.detailForUser({ id: customerId, role: UserRole.CUSTOMER } as AuthUser, order.id)),
      qrToken,
      dropoffCode,
    };
  }

  async list(user: AuthUser, scope = 'delivering', page = 1, limit = 20) {
    const driver =
      user.role === UserRole.DRIVER
        ? await this.driverProfiles.findOne({ where: { userId: user.id } })
        : null;
    const query = this.orders.createQueryBuilder('delivery');
    if (driver) query.where('delivery.driverId = :driverId', { driverId: driver.id });
    else query.where('delivery.customerId = :userId', { userId: user.id });
    if (scope === 'received') {
      query.andWhere('delivery.status IN (:...statuses)', {
        statuses: [
          DeliveryStatus.DELIVERED,
          DeliveryStatus.COMPLETED,
          DeliveryStatus.CANCELLED,
          DeliveryStatus.REJECTED,
        ],
      });
    } else if (scope === 'delivering') {
      query.andWhere('delivery.status NOT IN (:...statuses)', {
        statuses: [
          DeliveryStatus.DELIVERED,
          DeliveryStatus.COMPLETED,
          DeliveryStatus.CANCELLED,
          DeliveryStatus.REJECTED,
        ],
      });
    }
    query
      .orderBy('delivery.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);
    const [items, total] = await query.getManyAndCount();
    return { items, meta: { page, limit, total, pageCount: Math.ceil(total / limit) } };
  }

  async detailForUser(user: AuthUser, orderId: string) {
    const query = this.orders.createQueryBuilder('delivery').where('delivery.id = :orderId', { orderId });
    const order = await query.getOne();
    if (!order) throw new NotFoundException('Delivery not found');
    await this.assertAccess(user, order);
    const [items, stops, events, driver, vehicle] = await Promise.all([
      this.items.find({ where: { orderId }, order: { createdAt: 'ASC' } }),
      this.stops.find({ where: { orderId }, order: { sequence: 'ASC' } }),
      this.events.find({ where: { orderId }, order: { createdAt: 'ASC' } }),
      order.driverId ? this.driverProfiles.findOne({ where: { id: order.driverId } }) : null,
      order.vehicleId ? this.vehicles.findOne({ where: { id: order.vehicleId } }) : null,
    ]);
    const driverUser = driver ? await this.users.findOne({ where: { id: driver.userId } }) : null;
    return {
      order,
      items,
      stops,
      events,
      driver: driver ? { profile: driver, user: driverUser && this.safeUser(driverUser) } : null,
      vehicle,
    };
  }

  async track(trackingCode: string) {
    const order = await this.orders.findOne({ where: { trackingCode } });
    if (!order) throw new NotFoundException('Tracking code not found');
    const [stops, events, driver] = await Promise.all([
      this.stops.find({ where: { orderId: order.id }, order: { sequence: 'ASC' } }),
      this.events.find({ where: { orderId: order.id }, order: { createdAt: 'ASC' } }),
      order.driverId ? this.driverProfiles.findOne({ where: { id: order.driverId } }) : null,
    ]);
    return {
      trackingCode: order.trackingCode,
      packageName: order.packageName,
      status: order.status,
      pickupAddress: order.pickupAddress,
      destinationAddress: order.destinationAddress,
      estimatedDurationMinutes: order.estimatedDurationMinutes,
      stops,
      events,
      liveLocation:
        driver?.lastLatitude != null
          ? {
              latitude: driver.lastLatitude,
              longitude: driver.lastLongitude,
              updatedAt: driver.lastLocationAt,
            }
          : null,
    };
  }

  async recipientAction(user: AuthUser, orderId: string, accept: boolean, reason?: string) {
    const order = await this.orders.findOne({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Delivery not found');
    const receiver = order.receiver as { userId?: string; email?: string; phone?: string };
    const matches =
      receiver.userId === user.id || receiver.email === user.email || receiver.phone === user.phone;
    if (!matches && order.customerId !== user.id && user.role !== UserRole.ADMIN)
      throw new ForbiddenException('You are not the receiver');
    if (order.status !== DeliveryStatus.WAITING_ACCEPTANCE)
      throw new BadRequestException('Delivery is not awaiting acceptance');
    order.status = accept ? DeliveryStatus.ACCEPTED : DeliveryStatus.REJECTED;
    order.cancellationReason = accept ? undefined : (reason ?? 'Receiver rejected delivery');
    await this.orders.save(order);
    await this.log(order.id, accept ? 'RECIPIENT_ACCEPTED' : 'RECIPIENT_REJECTED', user.id, { reason });
    if (accept) void this.enqueueMatching(order);
    this.emit(order);
    return order;
  }

  async driverRequests(userId: string) {
    const driver = await this.drivers.getByUserId(userId);
    let genericOffers = await this.matching.listOffersForDriver(userId, ServiceType.DELIVERY);
    if (!genericOffers.length) {
      const unqueued = await this.orders.find({
        where: { status: DeliveryStatus.ACCEPTED },
        order: { createdAt: 'ASC' },
        take: 50,
      });
      for (const order of unqueued) {
        const job = await this.enqueueMatching(order);
        await this.matching.dispatch(job.id);
      }
      genericOffers = await this.matching.listOffersForDriver(userId, ServiceType.DELIVERY);
    }
    const orderIds = genericOffers
      .map((item) => item.job?.serviceId)
      .filter((id): id is string => Boolean(id));
    const orders = orderIds.length ? await this.orders.find({ where: { id: In(orderIds) } }) : [];
    return genericOffers.map(({ offer, job }) => ({
      offer,
      matchingJob: job,
      order: job ? orders.find((order) => order.id === job.serviceId) : null,
      distanceToPickupKm: Number(offer.distanceMeters ?? 0) / 1000,
      driverId: driver.id,
    }));
  }

  async driverAccept(userId: string, orderId: string) {
    const driver = await this.drivers.getByUserId(userId);
    if (!driver.currentVehicleId) throw new BadRequestException('Select a delivery vehicle first');
    const vehicle = await this.vehicles.findOne({
      where: { id: driver.currentVehicleId, status: VehicleStatus.ACTIVE },
    });
    if (!vehicle?.serviceCapabilities?.includes(ServiceType.DELIVERY))
      throw new BadRequestException('Active vehicle cannot perform deliveries');
    const order = await this.orders.findOne({ where: { id: orderId, status: DeliveryStatus.ACCEPTED } });
    if (!order) throw new BadRequestException('Delivery is no longer available');
    await this.matching.claim(userId, ServiceType.DELIVERY, orderId);
    order.driverId = driver.id;
    order.vehicleId = vehicle.id;
    order.status = DeliveryStatus.EN_ROUTE_PICKUP;
    await this.orders.save(order);
    driver.availabilityStatus = DriverAvailabilityStatus.BUSY;
    await this.driverProfiles.save(driver);
    await this.log(order.id, 'DRIVER_ACCEPTED', userId, { driverId: driver.id, vehicleId: vehicle.id });
    await this.notifications.create({
      userId: order.customerId,
      title: 'Delivery driver assigned',
      body: 'Your driver is heading to the pickup point.',
      data: { orderId },
    });
    this.emit(order);
    return order;
  }

  async driverReject(userId: string, orderId: string, reason?: string) {
    await this.drivers.getByUserId(userId);
    await this.matching.reject(userId, ServiceType.DELIVERY, orderId, reason);
    await this.log(orderId, 'DRIVER_REJECTED', userId, { reason });
    return { rejected: true };
  }

  async arrivePickup(userId: string, orderId: string) {
    const { order } = await this.assigned(userId, orderId);
    if (order.status !== DeliveryStatus.EN_ROUTE_PICKUP)
      throw new BadRequestException('Driver is not en route to pickup');
    order.status = DeliveryStatus.ARRIVED_PICKUP;
    await this.orders.save(order);
    await this.stops.update({ orderId, type: StopType.PICKUP }, { status: StopStatus.ARRIVED });
    await this.log(order.id, 'ARRIVED_PICKUP', userId);
    this.emit(order);
    return order;
  }

  async verifyPickup(userId: string, orderId: string, token: string) {
    const { order } = await this.assigned(userId, orderId, 'QR');
    if (order.status !== DeliveryStatus.ARRIVED_PICKUP)
      throw new BadRequestException('Driver must arrive at pickup before scanning');
    if (!safeEqualHash(token, order.qrTokenHash))
      throw new BadRequestException('Package QR code does not match this order');
    order.status = DeliveryStatus.PICKED_UP;
    order.pickedUpAt = new Date();
    await this.orders.save(order);
    await this.stops.update(
      { orderId, type: StopType.PICKUP },
      { status: StopStatus.COMPLETED, completedAt: new Date() },
    );
    await this.log(order.id, 'PACKAGE_PICKED_UP', userId);
    this.emit(order);
    return order;
  }

  async startTransit(userId: string, orderId: string) {
    const { order } = await this.assigned(userId, orderId);
    if (order.status !== DeliveryStatus.PICKED_UP)
      throw new BadRequestException('Package pickup must be confirmed first');
    order.status = DeliveryStatus.IN_TRANSIT;
    await this.orders.save(order);
    await this.log(order.id, 'DELIVERY_IN_TRANSIT', userId);
    await this.notifications.create({
      userId: order.customerId,
      title: 'Package is on the way',
      body: `Track ${order.trackingCode} live in the EVzone app.`,
      data: { orderId, trackingCode: order.trackingCode },
    });
    this.emit(order);
    return order;
  }

  async arriveDropoff(userId: string, orderId: string) {
    const { order } = await this.assigned(userId, orderId);
    if (order.status !== DeliveryStatus.IN_TRANSIT)
      throw new BadRequestException('Delivery is not in transit');
    order.status = DeliveryStatus.ARRIVED_DROPOFF;
    await this.orders.save(order);
    await this.stops.update({ orderId, type: StopType.DROPOFF }, { status: StopStatus.ARRIVED });
    await this.log(order.id, 'ARRIVED_DROPOFF', userId);
    this.emit(order);
    return order;
  }

  async verifyDropoff(userId: string, orderId: string, code: string) {
    const { order } = await this.assigned(userId, orderId, 'DROPOFF');
    if (order.status !== DeliveryStatus.ARRIVED_DROPOFF) {
      throw new BadRequestException('Driver must arrive at drop-off before verification');
    }
    if (!order.dropoffCodeHash || !safeEqualHash(code, order.dropoffCodeHash)) {
      throw new BadRequestException('Invalid delivery drop-off code');
    }
    order.dropoffVerified = true;
    await this.orders.save(order);
    await this.log(order.id, 'DROPOFF_RECIPIENT_VERIFIED', userId);
    this.emit(order);
    return { verified: true, order };
  }

  async dropoffCode(user: AuthUser, orderId: string) {
    const base = await this.orders.findOne({ where: { id: orderId } });
    if (!base) throw new NotFoundException('Delivery not found');
    await this.assertAccess(user, base);
    const order = await this.orders
      .createQueryBuilder('delivery')
      .addSelect('delivery.dropoffCode')
      .where('delivery.id = :orderId', { orderId })
      .getOne();
    if (!order) throw new NotFoundException('Delivery not found');
    return { orderId, dropoffCode: order.dropoffCode, verified: order.dropoffVerified };
  }

  async markDelivered(userId: string, orderId: string, dto: DeliveryActionDto) {
    const { order } = await this.assigned(userId, orderId);
    if (![DeliveryStatus.IN_TRANSIT, DeliveryStatus.ARRIVED_DROPOFF].includes(order.status)) {
      throw new BadRequestException('Delivery cannot be marked delivered in its current status');
    }
    const otpRequired =
      (process.env.DELIVERY_DROPOFF_OTP_REQUIRED ?? (process.env.NODE_ENV === 'production').toString()) ===
      'true';
    if (otpRequired && !order.dropoffVerified) {
      throw new BadRequestException('Recipient drop-off verification is required');
    }
    order.status = DeliveryStatus.DELIVERED;
    order.deliveredAt = new Date();
    order.finalCost = order.estimatedCost;
    await this.orders.save(order);
    await this.stops.update(
      { orderId, type: StopType.DROPOFF },
      { status: StopStatus.COMPLETED, completedAt: new Date() },
    );
    await this.log(order.id, 'PACKAGE_DELIVERED', userId, { proofUrl: dto.proofUrl });
    await this.notifications.create({
      userId: order.customerId,
      title: 'Package delivered',
      body: 'Confirm receipt to complete the order.',
      data: { orderId },
    });
    this.emit(order);
    return order;
  }

  async complete(customerId: string, orderId: string) {
    const order = await this.orders.findOne({ where: { id: orderId, customerId } });
    if (!order) throw new NotFoundException('Delivery not found');
    if (order.status !== DeliveryStatus.DELIVERED)
      throw new BadRequestException('Driver has not marked this order delivered');
    order.status = DeliveryStatus.COMPLETED;
    order.completedAt = new Date();
    await this.orders.save(order);
    if (order.driverId) {
      const driver = await this.driverProfiles.findOne({ where: { id: order.driverId } });
      if (driver) {
        driver.completedDeliveries += 1;
        driver.availabilityStatus = DriverAvailabilityStatus.ONLINE;
        await this.driverProfiles.save(driver);
      }
    }
    await this.matching.cancel(ServiceType.DELIVERY, order.id, 'ORDER_COMPLETED');
    await this.log(order.id, 'ORDER_COMPLETED', customerId);
    this.emit(order);
    if (order.paymentMethod === PaymentMethod.EVZONE_WALLET) {
      try {
        const payment = await this.payments.createIntent(customerId, {
          serviceType: ServiceType.DELIVERY,
          serviceId: order.id,
          method: PaymentMethod.EVZONE_WALLET,
          idempotencyKey: `delivery-complete-${order.id}`,
        });
        await this.payments.confirm(customerId, payment.id);
      } catch {
        // User can retry payment through the payment API.
      }
    }
    return order;
  }

  async cancel(user: AuthUser, orderId: string, dto: DeliveryActionDto) {
    const order = await this.orders.findOne({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Delivery not found');
    await this.assertAccess(user, order);
    if (
      [DeliveryStatus.DELIVERED, DeliveryStatus.COMPLETED, DeliveryStatus.CANCELLED].includes(order.status)
    ) {
      throw new BadRequestException(`Delivery cannot be cancelled in ${order.status} status`);
    }
    order.status = DeliveryStatus.CANCELLED;
    order.cancellationReason = dto.reason ?? 'Cancelled by user';
    await this.orders.save(order);
    if (order.driverId)
      await this.driverProfiles.update(order.driverId, {
        availabilityStatus: DriverAvailabilityStatus.ONLINE,
      });
    await this.matching.cancel(ServiceType.DELIVERY, order.id, 'DELIVERY_CANCELLED');
    await this.log(order.id, 'DELIVERY_CANCELLED', user.id, { reason: order.cancellationReason });
    this.emit(order);
    return order;
  }

  async createInvitation(senderUserId: string, orderId: string, dto: CreateTrackingInvitationDto) {
    const order = await this.orders.findOne({ where: { id: orderId, customerId: senderUserId } });
    if (!order) throw new NotFoundException('Delivery not found');
    if (!dto.recipientUserId && !dto.recipientPhone && !dto.recipientEmail) {
      throw new BadRequestException('Invitation recipient is required');
    }
    const invitation = await this.invitations.save(
      this.invitations.create({
        orderId,
        senderUserId,
        ...dto,
        token: randomUUID().replaceAll('-', ''),
        status: InvitationStatus.PENDING,
        expiresAt: new Date(Date.now() + 7 * 86400000),
      }),
    );
    if (dto.recipientUserId) {
      await this.notifications.create({
        userId: dto.recipientUserId,
        title: 'Tracking invitation',
        body: `You were invited to track ${order.trackingCode}.`,
        data: { invitationId: invitation.id, orderId },
      });
    }
    return invitation;
  }

  async listInvitations(user: AuthUser, direction = 'received') {
    if (direction === 'sent')
      return this.invitations.find({ where: { senderUserId: user.id }, order: { createdAt: 'DESC' } });
    return this.invitations
      .createQueryBuilder('invitation')
      .where('invitation.recipientUserId = :userId', { userId: user.id })
      .orWhere('invitation.recipientPhone = :phone', { phone: user.phone ?? '' })
      .orWhere('LOWER(invitation.recipientEmail) = LOWER(:email)', { email: user.email ?? '' })
      .orderBy('invitation.createdAt', 'DESC')
      .getMany();
  }

  async respondInvitation(user: AuthUser, invitationId: string, accept: boolean) {
    const invitation = await this.invitations.findOne({
      where: { id: invitationId, status: InvitationStatus.PENDING },
    });
    if (!invitation) throw new NotFoundException('Invitation not found');
    const matches =
      invitation.recipientUserId === user.id ||
      invitation.recipientPhone === user.phone ||
      invitation.recipientEmail?.toLowerCase() === user.email?.toLowerCase();
    if (!matches) throw new ForbiddenException('Invitation is not addressed to you');
    invitation.status = accept ? InvitationStatus.ACCEPTED : InvitationStatus.REJECTED;
    return this.invitations.save(invitation);
  }

  async withdrawInvitation(senderUserId: string, invitationId: string) {
    const invitation = await this.invitations.findOne({
      where: { id: invitationId, senderUserId, status: InvitationStatus.PENDING },
    });
    if (!invitation) throw new NotFoundException('Pending invitation not found');
    invitation.status = InvitationStatus.WITHDRAWN;
    return this.invitations.save(invitation);
  }

  async submitFeedback(customerId: string, orderId: string, dto: DeliveryFeedbackDto) {
    const order = await this.orders.findOne({ where: { id: orderId, customerId } });
    if (!order || order.status !== DeliveryStatus.COMPLETED)
      throw new BadRequestException('Completed delivery required');
    if (await this.feedback.findOne({ where: { orderId } }))
      throw new BadRequestException('Feedback already submitted');
    const record = await this.feedback.save(
      this.feedback.create({
        orderId,
        customerId,
        driverId: order.driverId,
        rating: dto.rating,
        message: dto.message,
        tipAmount: dto.tipAmount ?? 0,
      }),
    );
    if (order.driverId && (dto.tipAmount ?? 0) > 0) {
      const driver = await this.driverProfiles.findOne({ where: { id: order.driverId } });
      if (driver) {
        const reference = `TIP-DEL-${order.id}`;
        await this.wallets.debit(
          customerId,
          dto.tipAmount!,
          WalletTransactionType.TIP,
          reference,
          'Delivery tip',
        );
        await this.wallets.credit(
          driver.userId,
          dto.tipAmount!,
          WalletTransactionType.TIP,
          reference,
          'Delivery tip',
        );
      }
    }
    return record;
  }

  async createShare(customerId: string, orderId: string, recipients?: Record<string, unknown>[]) {
    const order = await this.orders.findOne({ where: { id: orderId, customerId } });
    if (!order) throw new NotFoundException('Delivery not found');
    return this.shares.save(
      this.shares.create({
        ownerUserId: customerId,
        serviceType: ServiceType.DELIVERY,
        serviceId: orderId,
        token: randomUUID().replaceAll('-', ''),
        recipients,
        expiresAt: new Date(Date.now() + 7 * 86400000),
        active: true,
      }),
    );
  }

  @OnEvent('matching.job.exhausted')
  async onMatchingExhausted(payload: { serviceType: ServiceType; serviceId: string; reason?: string }) {
    if (payload.serviceType !== ServiceType.DELIVERY) return;
    const order = await this.orders.findOne({ where: { id: payload.serviceId } });
    if (
      !order ||
      order.driverId ||
      ![DeliveryStatus.ACCEPTED, DeliveryStatus.DRIVER_ASSIGNED].includes(order.status)
    ) {
      return;
    }
    order.status = DeliveryStatus.CANCELLED;
    order.cancellationReason = payload.reason ?? 'NO_DRIVER_AVAILABLE';
    await this.orders.save(order);
    await this.log(order.id, 'NO_DRIVER_AVAILABLE', undefined, { reason: order.cancellationReason });
    await this.notifications.create({
      userId: order.customerId,
      title: 'No delivery driver available',
      body: 'No eligible delivery driver was found. The order was safely closed and can be booked again.',
      data: { orderId: order.id, reason: order.cancellationReason },
    });
    this.emit(order);
  }

  private async enqueueMatching(order: DeliveryOrder) {
    return this.matching.enqueue({
      serviceType: ServiceType.DELIVERY,
      serviceId: order.id,
      pickupLatitude: order.pickupLatitude,
      pickupLongitude: order.pickupLongitude,
      maxRadiusMeters: Number(process.env.DELIVERY_MATCH_MAX_RADIUS_M ?? 50000),
      concurrentOfferLimit: Number(process.env.DELIVERY_MATCH_CONCURRENT_OFFERS ?? 8),
      metadata: {
        trackingCode: order.trackingCode,
        packageName: order.packageName,
        deliveryServiceType: order.serviceType,
        estimatedCost: order.estimatedCost,
      },
    });
  }

  private async assigned(userId: string, orderId: string, includeSecret: 'QR' | 'DROPOFF' | null = null) {
    const driver = await this.drivers.getByUserId(userId);
    const query = this.orders.createQueryBuilder('delivery').where('delivery.id = :orderId', { orderId });
    if (includeSecret === 'QR') query.addSelect('delivery.qrTokenHash');
    if (includeSecret === 'DROPOFF') query.addSelect('delivery.dropoffCodeHash');
    const order = await query.getOne();
    if (!order || order.driverId !== driver.id)
      throw new ForbiddenException('Delivery is not assigned to this driver');
    return { order, driver };
  }

  private async assertAccess(user: AuthUser, order: DeliveryOrder) {
    if (
      [UserRole.ADMIN, UserRole.SUPPORT, UserRole.DISPATCHER].includes(user.role) ||
      order.customerId === user.id
    )
      return;
    if (user.role === UserRole.DRIVER) {
      const driver = await this.driverProfiles.findOne({ where: { userId: user.id } });
      if (driver?.id === order.driverId) return;
    }
    const receiver = order.receiver as { userId?: string; phone?: string; email?: string };
    if (
      receiver.userId === user.id ||
      receiver.phone === user.phone ||
      receiver.email?.toLowerCase() === user.email?.toLowerCase()
    )
      return;
    throw new ForbiddenException('You do not have access to this delivery');
  }

  private async log(
    orderId: string,
    eventType: string,
    actorUserId?: string,
    data?: Record<string, unknown>,
  ) {
    await this.events.save(this.events.create({ orderId, eventType, actorUserId, data }));
  }

  private emit(order: DeliveryOrder) {
    this.eventBus.emit('domain.event', {
      topic: 'deliveries',
      eventType: 'delivery.status.changed',
      aggregateType: 'DeliveryOrder',
      aggregateId: order.id,
      eventKey: order.id,
      payload: {
        orderId: order.id,
        customerId: order.customerId,
        driverId: order.driverId,
        status: order.status,
      },
    });
    this.eventBus.emit('service.updated', {
      serviceType: ServiceType.DELIVERY,
      serviceId: order.id,
      data: order,
    });
    this.eventBus.emit('user.event', { userId: order.customerId, event: 'delivery.updated', data: order });
  }

  private safeUser(user: User) {
    return { id: user.id, firstName: user.firstName, lastName: user.lastName, avatarUrl: user.avatarUrl };
  }
}
