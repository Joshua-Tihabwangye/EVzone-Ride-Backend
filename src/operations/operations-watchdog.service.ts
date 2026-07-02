import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, LessThan, Repository } from 'typeorm';
import { BookingStatus, DeliveryStatus, DocumentStatus, DriverAvailabilityStatus } from '../common/enums';
import {
  DeliveryOrder,
  DriverDocument,
  DriverProfile,
  OperationalAlert,
  Ride,
  VehicleDocument,
} from '../database/entities';
import { ProcessRoleService } from '../infrastructure/process-role.service';
import { WithSpan } from '../observability/tracing/trace.decorator';
import { BusinessMetricsService } from '../observability/metrics/business-metrics.service';

export interface WatchdogResult {
  staleDriversOffline: number;
  expiredRideRequests: number;
  expiredDocuments: number;
  stuckServiceAlerts: number;
  ranAt: string;
}

@Injectable()
export class OperationsWatchdogService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OperationsWatchdogService.name);
  private timer?: NodeJS.Timeout;
  private running = false;
  private lastResult?: WatchdogResult;

  constructor(
    @InjectRepository(DriverProfile) private readonly drivers: Repository<DriverProfile>,
    @InjectRepository(Ride) private readonly rides: Repository<Ride>,
    @InjectRepository(DeliveryOrder) private readonly deliveries: Repository<DeliveryOrder>,
    @InjectRepository(DriverDocument) private readonly driverDocuments: Repository<DriverDocument>,
    @InjectRepository(VehicleDocument) private readonly vehicleDocuments: Repository<VehicleDocument>,
    @InjectRepository(OperationalAlert) private readonly alerts: Repository<OperationalAlert>,
    private readonly roles: ProcessRoleService,
    private readonly businessMetrics: BusinessMetricsService,
  ) {}

  onModuleInit(): void {
    if ((process.env.OPERATIONS_WATCHDOG_ENABLED ?? 'true').toLowerCase() === 'false') return;
    if (!this.roles.runsWorkers()) {
      this.logger.log('Operations watchdog disabled for this process role');
      return;
    }
    const interval = Number(process.env.OPERATIONS_WATCHDOG_INTERVAL_MS ?? 30_000);
    this.timer = setInterval(() => void this.run().catch((error) => this.logger.error(error)), interval);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  status() {
    return {
      enabled: (process.env.OPERATIONS_WATCHDOG_ENABLED ?? 'true').toLowerCase() !== 'false',
      running: this.running,
      intervalMs: Number(process.env.OPERATIONS_WATCHDOG_INTERVAL_MS ?? 30_000),
      process: this.roles.status(),
      lastResult: this.lastResult,
    };
  }

  @WithSpan()
  async run(): Promise<WatchdogResult> {
    if (this.running) return this.lastResult ?? this.emptyResult();
    this.running = true;
    try {
      const [staleDriversOffline, expiredRideRequests, expiredDocuments, stuckServiceAlerts] =
        await Promise.all([
          this.markStaleDriversOffline(),
          this.expireUnmatchedRides(),
          this.expireDocuments(),
          this.flagStuckServices(),
        ]);
      this.lastResult = {
        staleDriversOffline,
        expiredRideRequests,
        expiredDocuments,
        stuckServiceAlerts,
        ranAt: new Date().toISOString(),
      };
      return this.lastResult;
    } finally {
      this.running = false;
    }
  }

  private async markStaleDriversOffline(): Promise<number> {
    const cutoff = new Date(Date.now() - Number(process.env.DRIVER_HEARTBEAT_TIMEOUT_MS ?? 300_000));
    const stale = await this.drivers
      .createQueryBuilder('driver')
      .where('driver.availabilityStatus = :status', { status: DriverAvailabilityStatus.ONLINE })
      .andWhere('(driver.lastLocationAt IS NULL OR driver.lastLocationAt < :cutoff)', { cutoff })
      .getMany();
    if (!stale.length) return 0;

    const ids = stale.map((driver) => driver.id);
    const [activeRides, activeDeliveries] = await Promise.all([
      this.rides.find({
        where: {
          driverId: In(ids),
          status: In([
            BookingStatus.DRIVER_EN_ROUTE,
            BookingStatus.ARRIVED,
            BookingStatus.WAITING,
            BookingStatus.VERIFIED,
            BookingStatus.IN_PROGRESS,
          ]),
        },
      }),
      this.deliveries.find({
        where: {
          driverId: In(ids),
          status: In([
            DeliveryStatus.ACCEPTED,
            DeliveryStatus.DRIVER_ASSIGNED,
            DeliveryStatus.EN_ROUTE_PICKUP,
            DeliveryStatus.ARRIVED_PICKUP,
            DeliveryStatus.PICKED_UP,
            DeliveryStatus.IN_TRANSIT,
            DeliveryStatus.ARRIVED_DROPOFF,
          ]),
        },
      }),
    ]);
    const busy = new Set([
      ...activeRides.map((item) => item.driverId).filter(Boolean),
      ...activeDeliveries.map((item) => item.driverId).filter(Boolean),
    ]);
    const forceOffline = stale.filter((driver) => !busy.has(driver.id));
    for (const driver of forceOffline) {
      driver.availabilityStatus = DriverAvailabilityStatus.OFFLINE;
      await this.drivers.save(driver);
      await this.ensureAlert({
        type: 'STALE_DRIVER_HEARTBEAT',
        severity: 'WARNING',
        title: 'Driver forced offline',
        message: 'Driver heartbeat exceeded the configured timeout.',
        subjectType: 'DRIVER',
        subjectId: driver.id,
        details: { lastLocationAt: driver.lastLocationAt },
      });
    }
    return forceOffline.length;
  }

  private async expireUnmatchedRides(): Promise<number> {
    const cutoff = new Date(Date.now() - Number(process.env.TRIP_REQUEST_TIMEOUT_MS ?? 600_000));
    const stale = await this.rides.find({
      where: {
        driverId: IsNull(),
        status: In([BookingStatus.SEARCHING, BookingStatus.OFFERED]),
        createdAt: LessThan(cutoff),
      },
    });
    for (const ride of stale) {
      ride.status = BookingStatus.EXPIRED;
      ride.cancelledAt = new Date();
      ride.cancellationReason = 'NO_DRIVER_ACCEPTED_WITHIN_TIMEOUT';
      await this.rides.save(ride);
    }
    return stale.length;
  }

  private async expireDocuments(): Promise<number> {
    const now = new Date();
    const [driverDocs, vehicleDocs] = await Promise.all([
      this.driverDocuments.find({
        where: { status: DocumentStatus.VERIFIED, expiryDate: LessThan(now) },
      }),
      this.vehicleDocuments.find({
        where: { status: DocumentStatus.VERIFIED, expiryDate: LessThan(now) },
      }),
    ]);
    for (const document of driverDocs) {
      document.status = DocumentStatus.EXPIRED;
      await this.driverDocuments.save(document);
    }
    for (const document of vehicleDocs) {
      document.status = DocumentStatus.EXPIRED;
      await this.vehicleDocuments.save(document);
    }
    return driverDocs.length + vehicleDocs.length;
  }

  private async flagStuckServices(): Promise<number> {
    const cutoff = new Date(Date.now() - Number(process.env.ACTIVE_SERVICE_STUCK_THRESHOLD_MS ?? 1_800_000));
    const [rides, deliveries] = await Promise.all([
      this.rides.find({
        where: {
          status: In([
            BookingStatus.DRIVER_EN_ROUTE,
            BookingStatus.ARRIVED,
            BookingStatus.WAITING,
            BookingStatus.VERIFIED,
            BookingStatus.IN_PROGRESS,
          ]),
          updatedAt: LessThan(cutoff),
        },
        take: 100,
      }),
      this.deliveries.find({
        where: {
          status: In([
            DeliveryStatus.EN_ROUTE_PICKUP,
            DeliveryStatus.ARRIVED_PICKUP,
            DeliveryStatus.PICKED_UP,
            DeliveryStatus.IN_TRANSIT,
            DeliveryStatus.ARRIVED_DROPOFF,
          ]),
          updatedAt: LessThan(cutoff),
        },
        take: 100,
      }),
    ]);
    let created = 0;
    for (const ride of rides) {
      created += await this.ensureAlert({
        type: 'STUCK_RIDE',
        severity: 'HIGH',
        title: 'Ride lifecycle appears stuck',
        message: `Ride has remained in ${ride.status} beyond the configured threshold.`,
        subjectType: 'RIDE',
        subjectId: ride.id,
        details: { status: ride.status, updatedAt: ride.updatedAt },
      });
    }
    for (const delivery of deliveries) {
      created += await this.ensureAlert({
        type: 'STUCK_DELIVERY',
        severity: 'HIGH',
        title: 'Delivery lifecycle appears stuck',
        message: `Delivery has remained in ${delivery.status} beyond the configured threshold.`,
        subjectType: 'DELIVERY',
        subjectId: delivery.id,
        details: { status: delivery.status, updatedAt: delivery.updatedAt },
      });
    }
    return created;
  }

  private async ensureAlert(input: {
    type: string;
    severity: string;
    title: string;
    message: string;
    subjectType?: string;
    subjectId?: string;
    details?: Record<string, unknown>;
  }): Promise<number> {
    const existing = await this.alerts.findOne({
      where: {
        type: input.type,
        subjectId: input.subjectId,
        status: In(['OPEN', 'ACKNOWLEDGED']),
      },
    });
    if (existing) return 0;
    await this.alerts.save(this.alerts.create({ ...input, status: 'OPEN' }));
    this.businessMetrics.recordOperationsAlert(input.severity, 'OPEN');
    return 1;
  }

  private emptyResult(): WatchdogResult {
    return {
      staleDriversOffline: 0,
      expiredRideRequests: 0,
      expiredDocuments: 0,
      stuckServiceAlerts: 0,
      ranAt: new Date().toISOString(),
    };
  }
}
