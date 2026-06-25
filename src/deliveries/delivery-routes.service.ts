import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import {
  DeliveryRouteStatus,
  DeliveryStatus,
  DriverAvailabilityStatus,
  ServiceType,
  StopStatus,
  StopType,
  VehicleStatus,
} from '../common/enums';
import { haversineKm } from '../common/utils/geo';
import { DeliveryOrder, DeliveryRoute, DeliveryStop, DriverProfile, Vehicle } from '../database/entities';
import { MatchingService } from '../matching/matching.service';
import {
  AddDeliveryRouteOrdersDto,
  CompleteDeliveryRouteDto,
  CreateDeliveryRouteDto,
  DispatchDeliveryRouteDto,
  UpdateDeliveryRouteStopDto,
} from './delivery-routes.dto';

@Injectable()
export class DeliveryRoutesService {
  constructor(
    @InjectRepository(DeliveryRoute) private readonly routes: Repository<DeliveryRoute>,
    @InjectRepository(DeliveryStop) private readonly stops: Repository<DeliveryStop>,
    @InjectRepository(DeliveryOrder) private readonly orders: Repository<DeliveryOrder>,
    @InjectRepository(DriverProfile) private readonly drivers: Repository<DriverProfile>,
    @InjectRepository(Vehicle) private readonly vehicles: Repository<Vehicle>,
    private readonly matching: MatchingService,
    private readonly events: EventEmitter2,
  ) {}

  async create(actorUserId: string, dto: CreateDeliveryRouteDto) {
    const orders = await this.loadOrders(dto.orderIds);
    this.assertOrdersRouteable(orders);
    const route = await this.routes.save(
      this.routes.create({
        organizationId: dto.organizationId,
        driverId: dto.driverId,
        vehicleId: dto.vehicleId,
        name: dto.name,
        status: DeliveryRouteStatus.DRAFT,
        plannedStartAt: dto.plannedStartAt ? new Date(dto.plannedStartAt) : undefined,
        metadata: { ...(dto.metadata ?? {}), createdByUserId: actorUserId },
      }),
    );
    await this.attachOrders(route.id, dto.orderIds);
    const optimized = await this.optimize(route.id);
    await this.publish('delivery.route.created', optimized.route, {
      actorUserId,
      orderIds: dto.orderIds,
    });
    return optimized;
  }

  async addOrders(routeId: string, dto: AddDeliveryRouteOrdersDto, actorUserId: string) {
    const route = await this.getRoute(routeId);
    if (![DeliveryRouteStatus.DRAFT, DeliveryRouteStatus.PLANNED].includes(route.status)) {
      throw new BadRequestException('Orders can only be added before route dispatch');
    }
    const orders = await this.loadOrders(dto.orderIds);
    this.assertOrdersRouteable(orders);
    await this.attachOrders(route.id, dto.orderIds);
    const optimized = await this.optimize(route.id);
    await this.publish('delivery.route.orders.added', route, {
      actorUserId,
      orderIds: dto.orderIds,
    });
    return optimized;
  }

  async list(filters: { status?: DeliveryRouteStatus; driverId?: string; organizationId?: string }) {
    const query = this.routes.createQueryBuilder('route');
    if (filters.status) query.andWhere('route.status = :status', { status: filters.status });
    if (filters.driverId) query.andWhere('route.driverId = :driverId', { driverId: filters.driverId });
    if (filters.organizationId) {
      query.andWhere('route.organizationId = :organizationId', {
        organizationId: filters.organizationId,
      });
    }
    return query.orderBy('route.createdAt', 'DESC').getMany();
  }

  async detail(routeId: string) {
    const route = await this.getRoute(routeId);
    const stops = await this.stops.find({ where: { routeId }, order: { sequence: 'ASC' } });
    const orderIds = [...new Set(stops.map((stop) => stop.orderId))];
    const orders = orderIds.length ? await this.orders.find({ where: { id: In(orderIds) } }) : [];
    return { route, stops, orders };
  }

  async optimize(routeId: string) {
    const route = await this.getRoute(routeId);
    if (![DeliveryRouteStatus.DRAFT, DeliveryRouteStatus.PLANNED].includes(route.status)) {
      throw new BadRequestException('Only draft or planned routes can be optimized');
    }
    const stops = await this.stops.find({ where: { routeId } });
    if (!stops.length) throw new BadRequestException('Route has no delivery stops');
    const remaining = [...stops];
    const visitedPickups = new Set<string>();
    const ordered: DeliveryStop[] = [];
    let current = remaining
      .filter((stop) => stop.type === StopType.PICKUP)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())[0];
    current ??= remaining[0];

    while (remaining.length) {
      let next = current;
      if (!remaining.some((item) => item.id === next.id)) {
        const eligible = remaining.filter(
          (stop) => stop.type === StopType.PICKUP || visitedPickups.has(stop.orderId),
        );
        next = this.closest(ordered.at(-1), eligible.length ? eligible : remaining);
      }
      const index = remaining.findIndex((item) => item.id === next.id);
      if (index < 0) continue;
      remaining.splice(index, 1);
      ordered.push(next);
      if (next.type === StopType.PICKUP) visitedPickups.add(next.orderId);
      current = this.closest(
        next,
        remaining.filter((stop) => stop.type === StopType.PICKUP || visitedPickups.has(stop.orderId)),
      );
    }

    let distanceKm = 0;
    for (let index = 0; index < ordered.length; index += 1) {
      ordered[index].sequence = index;
      if (index > 0) {
        distanceKm += haversineKm(
          { latitude: ordered[index - 1].latitude, longitude: ordered[index - 1].longitude },
          { latitude: ordered[index].latitude, longitude: ordered[index].longitude },
        );
      }
    }
    await this.stops.save(ordered);
    route.status = DeliveryRouteStatus.PLANNED;
    route.estimatedDistanceKm = Math.round(distanceKm * 1000) / 1000;
    route.estimatedDurationMinutes = Math.ceil(
      (distanceKm / Number(process.env.ROUTE_AVG_SPEED_KPH ?? 30)) * 60,
    );
    route.optimization = {
      algorithm: 'CONSTRAINT_AWARE_NEAREST_NEIGHBOUR',
      optimizedAt: new Date().toISOString(),
      stopCount: ordered.length,
      pickupPrecedesDropoff: true,
    };
    await this.routes.save(route);
    return this.detail(route.id);
  }

  async dispatch(routeId: string, dto: DispatchDeliveryRouteDto, actorUserId: string) {
    const route = await this.getRoute(routeId);
    if (![DeliveryRouteStatus.PLANNED, DeliveryRouteStatus.DRAFT].includes(route.status)) {
      throw new BadRequestException('Route is not available for dispatch');
    }
    const [driver, vehicle] = await Promise.all([
      this.drivers.findOne({ where: { id: dto.driverId } }),
      this.vehicles.findOne({ where: { id: dto.vehicleId } }),
    ]);
    if (!driver) throw new NotFoundException('Driver not found');
    if (!driver.serviceCapabilities?.includes(ServiceType.DELIVERY)) {
      throw new BadRequestException('Driver is not enabled for delivery services');
    }
    if (
      !vehicle ||
      vehicle.status !== VehicleStatus.ACTIVE ||
      !vehicle.serviceCapabilities?.includes(ServiceType.DELIVERY)
    ) {
      throw new BadRequestException('Vehicle is not active for delivery services');
    }
    route.driverId = driver.id;
    route.vehicleId = vehicle.id;
    route.plannedStartAt = dto.plannedStartAt ? new Date(dto.plannedStartAt) : route.plannedStartAt;
    route.status = DeliveryRouteStatus.DISPATCHED;
    await this.routes.save(route);
    const stopRows = await this.stops.find({ where: { routeId } });
    const orderIds = [...new Set(stopRows.map((stop) => stop.orderId))];
    if (orderIds.length) {
      await this.orders
        .createQueryBuilder()
        .update(DeliveryOrder)
        .set({ driverId: driver.id, vehicleId: vehicle.id, status: DeliveryStatus.DRIVER_ASSIGNED })
        .where('id IN (:...orderIds)', { orderIds })
        .andWhere('status IN (:...statuses)', {
          statuses: [DeliveryStatus.ACCEPTED, DeliveryStatus.DRIVER_ASSIGNED],
        })
        .execute();
      await Promise.all(
        orderIds.map((orderId) =>
          this.matching.cancel(ServiceType.DELIVERY, orderId, 'ASSIGNED_TO_MULTI_STOP_ROUTE'),
        ),
      );
    }
    await this.publish('delivery.route.dispatched', route, {
      actorUserId,
      driverId: driver.id,
      vehicleId: vehicle.id,
      orderIds,
    });
    return this.detail(route.id);
  }

  async start(routeId: string, userId: string) {
    const route = await this.getRoute(routeId);
    if (route.status !== DeliveryRouteStatus.DISPATCHED) {
      throw new BadRequestException('Route must be dispatched before it starts');
    }
    const driver = route.driverId ? await this.drivers.findOne({ where: { id: route.driverId } }) : null;
    if (!driver) throw new BadRequestException('Route has no assigned driver');
    if (driver.userId !== userId) throw new BadRequestException('Route is assigned to another driver');
    route.status = DeliveryRouteStatus.IN_PROGRESS;
    route.startedAt = new Date();
    await this.routes.save(route);
    driver.availabilityStatus = DriverAvailabilityStatus.BUSY;
    await this.drivers.save(driver);
    const stopRows = await this.stops.find({ where: { routeId } });
    const orderIds = [...new Set(stopRows.map((stop) => stop.orderId))];
    if (orderIds.length) {
      await this.orders
        .createQueryBuilder()
        .update(DeliveryOrder)
        .set({ status: DeliveryStatus.EN_ROUTE_PICKUP })
        .where('id IN (:...orderIds)', { orderIds })
        .andWhere('status = :status', { status: DeliveryStatus.DRIVER_ASSIGNED })
        .execute();
    }
    await this.publish('delivery.route.started', route, { driverId: driver.id, orderIds });
    return this.detail(route.id);
  }

  async updateStop(routeId: string, stopId: string, dto: UpdateDeliveryRouteStopDto, actorUserId: string) {
    const route = await this.getRoute(routeId);
    if (route.status !== DeliveryRouteStatus.IN_PROGRESS) {
      throw new BadRequestException('Route is not in progress');
    }
    const stop = await this.stops.findOne({ where: { id: stopId, routeId } });
    if (!stop) throw new NotFoundException('Route stop not found');
    const order = await this.orders
      .createQueryBuilder('delivery')
      .addSelect('delivery.dropoffCodeHash')
      .where('delivery.id = :orderId', { orderId: stop.orderId })
      .getOne();
    if (!order) throw new NotFoundException('Delivery order for route stop not found');
    this.assertStopVerification(order, stop, dto.status);
    stop.status = dto.status;
    stop.completedAt = dto.status === StopStatus.COMPLETED ? new Date() : stop.completedAt;
    await this.stops.save(stop);
    await this.synchronizeOrderStatus(order, stop, dto.status);
    await this.publish('delivery.route.stop.updated', route, {
      actorUserId,
      stopId,
      orderId: stop.orderId,
      stopType: stop.type,
      status: stop.status,
      proofUrl: dto.proofUrl,
      notes: dto.notes,
    });
    return { route, stop };
  }

  async complete(routeId: string, dto: CompleteDeliveryRouteDto, actorUserId: string) {
    const route = await this.getRoute(routeId);
    if (route.status !== DeliveryRouteStatus.IN_PROGRESS) {
      throw new BadRequestException('Route is not in progress');
    }
    const stops = await this.stops.find({ where: { routeId } });
    const unfinished = stops.filter((stop) => stop.status !== StopStatus.COMPLETED);
    if (unfinished.length && !dto.force) {
      throw new BadRequestException({
        message: 'All stops must be completed before closing the route',
        unfinishedStopIds: unfinished.map((stop) => stop.id),
      });
    }
    route.status = DeliveryRouteStatus.COMPLETED;
    route.completedAt = new Date();
    if (dto.actualDistanceKm != null) route.estimatedDistanceKm = dto.actualDistanceKm;
    route.metadata = { ...(route.metadata ?? {}), ...(dto.metadata ?? {}), completedByUserId: actorUserId };
    await this.routes.save(route);
    if (route.driverId) {
      await this.drivers.update(route.driverId, { availabilityStatus: DriverAvailabilityStatus.ONLINE });
    }
    await this.publish('delivery.route.completed', route, {
      actorUserId,
      forced: Boolean(dto.force),
      unfinishedStops: unfinished.length,
    });
    return this.detail(route.id);
  }

  private assertStopVerification(order: DeliveryOrder, stop: DeliveryStop, status: StopStatus) {
    if (status !== StopStatus.COMPLETED) return;
    if (
      stop.type === StopType.PICKUP &&
      ![
        DeliveryStatus.QR_VERIFIED,
        DeliveryStatus.PICKED_UP,
        DeliveryStatus.IN_TRANSIT,
        DeliveryStatus.ARRIVED_DROPOFF,
        DeliveryStatus.DELIVERED,
        DeliveryStatus.COMPLETED,
      ].includes(order.status)
    ) {
      throw new BadRequestException('Package QR must be verified before completing a pickup stop');
    }
    const dropoffOtpRequired = (process.env.DELIVERY_DROPOFF_OTP_REQUIRED ?? 'true').toLowerCase() === 'true';
    if (stop.type === StopType.DROPOFF && dropoffOtpRequired && !order.dropoffVerified) {
      throw new BadRequestException('Recipient OTP must be verified before completing a drop-off stop');
    }
  }

  private async synchronizeOrderStatus(
    order: DeliveryOrder,
    stop: DeliveryStop,
    status: StopStatus,
  ): Promise<void> {
    if (stop.type === StopType.PICKUP) {
      if (status === StopStatus.EN_ROUTE) order.status = DeliveryStatus.EN_ROUTE_PICKUP;
      if (status === StopStatus.ARRIVED) order.status = DeliveryStatus.ARRIVED_PICKUP;
      if (status === StopStatus.COMPLETED) {
        order.status = DeliveryStatus.PICKED_UP;
        order.pickedUpAt ??= new Date();
      }
    } else {
      if (status === StopStatus.EN_ROUTE) order.status = DeliveryStatus.IN_TRANSIT;
      if (status === StopStatus.ARRIVED) order.status = DeliveryStatus.ARRIVED_DROPOFF;
      if (status === StopStatus.COMPLETED) {
        order.status = DeliveryStatus.DELIVERED;
        order.deliveredAt ??= new Date();
      }
    }
    await this.orders.save(order);
  }

  private async attachOrders(routeId: string, orderIds: string[]) {
    await this.orders
      .createQueryBuilder()
      .update(DeliveryOrder)
      .set({ routeId })
      .where('id IN (:...orderIds)', { orderIds })
      .execute();
    await this.stops
      .createQueryBuilder()
      .update(DeliveryStop)
      .set({ routeId })
      .where('orderId IN (:...orderIds)', { orderIds })
      .execute();
  }

  private async loadOrders(orderIds: string[]) {
    const unique = [...new Set(orderIds)];
    const orders = await this.orders.find({ where: { id: In(unique) } });
    if (orders.length !== unique.length)
      throw new NotFoundException('One or more delivery orders were not found');
    return orders;
  }

  private assertOrdersRouteable(orders: DeliveryOrder[]) {
    const alreadyRouted = orders.filter((order) => Boolean(order.routeId));
    if (alreadyRouted.length) {
      throw new BadRequestException({
        message: 'One or more delivery orders already belong to a route',
        orderIds: alreadyRouted.map((order) => order.id),
      });
    }
    const unavailable = orders.filter((order) =>
      [DeliveryStatus.COMPLETED, DeliveryStatus.CANCELLED, DeliveryStatus.REJECTED].includes(order.status),
    );
    if (unavailable.length) {
      throw new BadRequestException({
        message: 'Completed, cancelled or rejected orders cannot be routed',
        orderIds: unavailable.map((order) => order.id),
      });
    }
  }

  private closest(origin: DeliveryStop | undefined, candidates: DeliveryStop[]): DeliveryStop {
    if (!candidates.length) return origin as DeliveryStop;
    if (!origin) return candidates[0];
    return candidates.reduce((best, candidate) => {
      const bestDistance = haversineKm(
        { latitude: origin.latitude, longitude: origin.longitude },
        { latitude: best.latitude, longitude: best.longitude },
      );
      const candidateDistance = haversineKm(
        { latitude: origin.latitude, longitude: origin.longitude },
        { latitude: candidate.latitude, longitude: candidate.longitude },
      );
      return candidateDistance < bestDistance ? candidate : best;
    });
  }

  private async getRoute(id: string) {
    const route = await this.routes.findOne({ where: { id } });
    if (!route) throw new NotFoundException('Delivery route not found');
    return route;
  }

  private async publish(eventType: string, route: DeliveryRoute, payload: Record<string, unknown>) {
    this.events.emit('domain.event', {
      topic: 'delivery-routes',
      eventType,
      aggregateType: 'DeliveryRoute',
      aggregateId: route.id,
      eventKey: route.id,
      payload: { routeId: route.id, status: route.status, ...payload },
    });
    this.events.emit('service.updated', {
      serviceType: ServiceType.DELIVERY,
      serviceId: route.id,
      data: { event: eventType, route, ...payload },
    });
  }
}
