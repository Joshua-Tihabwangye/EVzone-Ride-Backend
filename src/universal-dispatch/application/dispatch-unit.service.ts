import { BadRequestException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../../infrastructure/redis.service';
import { DriverProfile, Vehicle } from '../../database/entities';
import {
  DispatchDriverShift,
  DispatchVehicleCapability,
  UniversalDispatchLocation,
  UniversalDispatchUnit,
} from '../domain/universal-dispatch.entities';
import {
  DispatchOwnerType,
  DispatchShiftStatus,
  DispatchUnitStatus,
  UniversalServiceType,
} from '../domain/universal-dispatch.enums';
import {
  DispatchComplianceSnapshot,
  DispatchDriverSnapshot,
  DispatchFleetSnapshot,
  DispatchShiftSnapshot,
  DispatchUnitSnapshot,
  DispatchVehicleSnapshot,
} from '../domain/universal-dispatch.types';
import { UniversalDispatchStateMachineService } from './universal-dispatch-state-machine.service';
import { DispatchLiveStateService } from '../infrastructure/dispatch-live-state.service';
import { DispatchGeoIndexService } from '../infrastructure/dispatch-geo-index.service';
import {
  DispatchLocationUpdateDto,
  GoOnlineDto,
  GoOfflineDto,
  SetActiveDispatchVehicleDto,
} from '../universal-dispatch.dto';

@Injectable()
export class DispatchUnitService implements OnModuleInit {
  private defaultMarketId = 'default';

  constructor(
    @InjectRepository(UniversalDispatchUnit)
    private readonly units: Repository<UniversalDispatchUnit>,
    @InjectRepository(DriverProfile)
    private readonly drivers: Repository<DriverProfile>,
    @InjectRepository(DispatchVehicleCapability)
    private readonly vehicleCapabilities: Repository<DispatchVehicleCapability>,
    @InjectRepository(DispatchDriverShift)
    private readonly shifts: Repository<DispatchDriverShift>,
    @InjectRepository(Vehicle)
    private readonly vehicles: Repository<Vehicle>,
    @InjectRepository(UniversalDispatchLocation)
    private readonly locations: Repository<UniversalDispatchLocation>,
    private readonly dataSource: DataSource,
    private readonly config: ConfigService,
    private readonly liveState: DispatchLiveStateService,
    private readonly geoIndex: DispatchGeoIndexService,
    private readonly redis: RedisService,
    private readonly stateMachine: UniversalDispatchStateMachineService,
  ) {}

  onModuleInit(): void {
    this.defaultMarketId = this.config.get<string>('DISPATCH_DEFAULT_MARKET') ?? 'default';
  }

  async setActiveVehicle(
    driverId: string,
    input: SetActiveDispatchVehicleDto,
  ): Promise<UniversalDispatchUnit> {
    return this.dataSource.transaction(async (manager) => {
      const unitRepository = manager.getRepository(UniversalDispatchUnit);
      const vehicle = await this.vehicles.findOne({ where: { id: input.vehicleId } });
      if (!vehicle) throw new NotFoundException('Vehicle not found');

      let unit = await unitRepository.findOne({
        where: { driverId, status: DispatchUnitStatus.OFFLINE },
        order: { createdAt: 'DESC' },
      });
      if (!unit) {
        unit = unitRepository.create({
          driverId,
          activeVehicleId: input.vehicleId,
          marketId: input.marketId ?? this.defaultMarketId,
          status: DispatchUnitStatus.OFFLINE,
          ownerType: input.fleetId ? DispatchOwnerType.FLEET : DispatchOwnerType.INDIVIDUAL,
          fleetId: input.fleetId,
        });
      } else {
        unit.activeVehicleId = input.vehicleId;
        unit.fleetId = input.fleetId ?? unit.fleetId;
        unit.marketId = input.marketId ?? unit.marketId;
      }
      unit = await unitRepository.save(unit);
      await this.rebuildSnapshot(manager, unit);
      return unit;
    });
  }

  async goOnline(driverId: string, input: GoOnlineDto): Promise<UniversalDispatchUnit> {
    return this.dataSource.transaction(async (manager) => {
      const unitRepository = manager.getRepository(UniversalDispatchUnit);
      let unit = await unitRepository.findOne({
        where: { driverId },
        order: { createdAt: 'DESC' },
      });
      if (!unit) {
        if (!input.vehicleId) throw new BadRequestException('Active vehicle required to go online');
        unit = unitRepository.create({
          driverId,
          activeVehicleId: input.vehicleId,
          marketId: input.marketId ?? this.defaultMarketId,
          status: DispatchUnitStatus.OFFLINE,
        });
      }
      if (input.vehicleId) unit.activeVehicleId = input.vehicleId;
      if (input.marketId) unit.marketId = input.marketId;

      await this.stateMachine.transitionUnit(manager, unit, DispatchUnitStatus.AVAILABLE, {
        actorType: 'DRIVER',
        actorId: driverId,
      });
      unit.onlineAt = new Date();
      unit.offlineAt = undefined;
      unit.availableSince = new Date();
      if (input.location) {
        unit.latitude = input.location.latitude;
        unit.longitude = input.location.longitude;
        unit.accuracyMeters = input.location.accuracyMeters;
        unit.locationRecordedAt = new Date();
      }
      if (input.batterySoc != null) unit.batterySoc = input.batterySoc;
      if (input.usableRangeKm != null) unit.usableRangeKm = input.usableRangeKm;
      unit = await unitRepository.save(unit);

      if (input.requestedServices?.length) {
        unit.enabledServices = input.requestedServices;
      }
      await this.rebuildSnapshot(manager, unit);
      await this.updateGeoIndex(unit);
      return unit;
    });
  }

  async goOffline(driverId: string, input: GoOfflineDto): Promise<UniversalDispatchUnit> {
    const unit = await this.units.findOne({
      where: { driverId },
      order: { createdAt: 'DESC' },
    });
    if (!unit) throw new NotFoundException('Dispatch unit not found');
    if (unit.activeRequestId && !input.force) {
      throw new BadRequestException('Cannot go offline with active trip');
    }
    await this.stateMachine.transitionUnit(this.dataSource.manager, unit, DispatchUnitStatus.OFFLINE, {
      actorType: 'DRIVER',
      actorId: driverId,
    });
    unit.offlineAt = new Date();
    unit.availableSince = undefined;
    const saved = await this.units.save(unit);
    await this.updateGeoIndex(saved);
    await this.liveState.removeLiveSnapshot(saved.id, saved.marketId);
    return saved;
  }

  async updateLocation(driverId: string, input: DispatchLocationUpdateDto): Promise<UniversalDispatchUnit> {
    const unit = await this.units.findOne({
      where: { driverId },
      order: { createdAt: 'DESC' },
    });
    if (!unit) throw new NotFoundException('Dispatch unit not found');

    if (input.sequence <= unit.locationSequence) {
      throw new BadRequestException('Out-of-order location update rejected');
    }
    const ageSeconds = (Date.now() - new Date(input.recordedAt).getTime()) / 1000;
    const maxAgeSeconds = Number(this.config.get<string>('DISPATCH_LOCATION_MAX_AGE_SECONDS') ?? 120);
    if (ageSeconds > maxAgeSeconds) {
      throw new BadRequestException('Stale location update rejected');
    }

    unit.locationSequence = input.sequence;
    unit.latitude = input.latitude;
    unit.longitude = input.longitude;
    unit.accuracyMeters = input.accuracyMeters;
    unit.speedKph = input.speedKph;
    unit.heading = input.heading;
    unit.batterySoc = input.batterySoc ?? unit.batterySoc;
    unit.usableRangeKm = input.usableRangeKm ?? unit.usableRangeKm;
    unit.chargingState = input.chargingState ?? unit.chargingState;
    unit.locationRecordedAt = new Date(input.recordedAt);

    const saved = await this.units.save(unit);
    await this.locations.save(
      this.locations.create({
        dispatchUnitId: saved.id,
        sequence: input.sequence,
        latitude: input.latitude,
        longitude: input.longitude,
        accuracyMeters: input.accuracyMeters,
        speedKph: input.speedKph,
        heading: input.heading,
        recordedAt: new Date(input.recordedAt),
      }),
    );
    await this.rebuildSnapshot(undefined, saved);
    await this.updateGeoIndex(saved);
    return saved;
  }

  async rebuildSnapshot(
    manager: EntityManager | DataSource | undefined,
    unit: UniversalDispatchUnit,
  ): Promise<DispatchUnitSnapshot> {
    const driver = await this.drivers.findOne({ where: { id: unit.driverId } });
    const vehicle = await this.vehicles.findOne({ where: { id: unit.activeVehicleId } });
    const capabilities = await this.vehicleCapabilities.find({
      where: { vehicleId: unit.activeVehicleId },
    });
    const activeShift = await this.shifts.findOne({
      where: { driverId: unit.driverId, status: DispatchShiftStatus.OPEN },
      order: { createdAt: 'DESC' },
    });

    const driverSnapshot: DispatchDriverSnapshot = {
      driverId: unit.driverId,
      userId: driver?.userId ?? unit.driverId,
      rating: Number(driver?.rating ?? 4.5),
      ratingsCount: Number(driver?.ratingsCount ?? 0),
      completedJobs: Number(driver?.completedRides ?? 0) + Number(driver?.completedDeliveries ?? 0),
      acceptanceRate: 0.8,
      cancellationRate: 0.02,
      languages: [],
      certifications: unit.driverCertifications ?? [],
      entitlements: unit.enabledServices ?? [],
    };

    const vehicleSnapshot: DispatchVehicleSnapshot = {
      vehicleId: unit.activeVehicleId,
      vehicleType: vehicle?.vehicleType ?? 'SEDAN',
      energyType: vehicle?.energyType ?? 'PETROL',
      passengerCapacity: vehicle?.seats ?? 4,
      cargoWeightKg: Number(vehicle?.cargoCapacityKg ?? 0),
      cargoVolumeM3: 0,
      capabilities: {},
      verifiedCapabilityCodes: capabilities.filter((c) => c.verified).map((c) => c.code),
    };

    const complianceSnapshot: DispatchComplianceSnapshot = {
      driverAccountActive: true,
      driverVerified: true,
      safetyClear: true,
      driverSuspended: false,
      vehicleActive: true,
      vehicleVerified: true,
      driverDocumentsValid: true,
      insuranceValid: true,
      inspectionValid: true,
      registrationValid: true,
      blockedReasons: [],
    };

    const shiftSnapshot: DispatchShiftSnapshot = {
      active: Boolean(activeShift),
      shiftId: activeShift?.id,
      remainingMinutes: activeShift
        ? Math.max(0, Math.floor((activeShift.endsAt.getTime() - Date.now()) / 60000))
        : 480,
      breakRequired: activeShift?.status === DispatchShiftStatus.BREAK_REQUIRED,
      startsAt: activeShift?.startsAt?.toISOString(),
      endsAt: activeShift?.endsAt?.toISOString(),
    };

    const fleetSnapshot: DispatchFleetSnapshot = {
      fleetId: unit.fleetId,
      active: Boolean(unit.fleetId),
      allowed: true,
      rules: {},
    };

    const snapshot: DispatchUnitSnapshot = {
      snapshotVersion: (unit.snapshotVersion ?? 0) + 1,
      generatedAt: new Date().toISOString(),
      driver: driverSnapshot,
      vehicle: vehicleSnapshot,
      compliance: complianceSnapshot,
      shift: shiftSnapshot,
      fleet: fleetSnapshot,
      enabledServices: unit.enabledServices ?? [],
      riskSignals: unit.riskSignals ?? [],
      liveState: this.liveState.buildLiveStateFromUnit(unit),
    };

    unit.snapshotVersion = snapshot.snapshotVersion;
    unit.eligibilitySnapshot = snapshot as unknown as Record<string, unknown>;
    unit.eligibilitySnapshotRefreshedAt = new Date();
    unit.remainingShiftMinutes = shiftSnapshot.remainingMinutes;

    const repo = manager?.getRepository(UniversalDispatchUnit) ?? this.units;
    await repo.save(unit);
    await this.liveState.setLiveSnapshot(unit, snapshot);
    return snapshot;
  }

  private async updateGeoIndex(unit: UniversalDispatchUnit): Promise<void> {
    const services = unit.enabledServices?.length
      ? unit.enabledServices
      : Object.values(UniversalServiceType);
    await this.geoIndex.add(unit, services);
  }
}
