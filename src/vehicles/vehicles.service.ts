import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { DocumentStatus, ServiceType, VehicleStatus, VehicleType } from '../common/enums';
import { DriverProfile, RentalBlock, Vehicle, VehicleAccessory, VehicleDocument } from '../database/entities';
import { CreateVehicleDto, SetAccessoriesDto, UpdateVehicleDto, VehicleDocumentDto } from './vehicles.dto';

@Injectable()
export class VehiclesService {
  constructor(
    @InjectRepository(Vehicle) private readonly vehicles: Repository<Vehicle>,
    @InjectRepository(VehicleDocument) private readonly documents: Repository<VehicleDocument>,
    @InjectRepository(VehicleAccessory) private readonly accessories: Repository<VehicleAccessory>,
    @InjectRepository(DriverProfile) private readonly drivers: Repository<DriverProfile>,
    @InjectRepository(RentalBlock) private readonly rentalBlocks: Repository<RentalBlock>,
  ) {}

  async listMine(userId: string) {
    const driver = await this.drivers.findOne({ where: { userId } });
    const where = driver
      ? [{ ownerUserId: userId }, { assignedDriverId: driver.id }]
      : [{ ownerUserId: userId }];
    return this.vehicles.find({ where, order: { isActive: 'DESC', createdAt: 'DESC' } });
  }

  async publicAvailable(serviceType?: ServiceType, vehicleType?: VehicleType) {
    const items = await this.vehicles.find({
      where: { status: VehicleStatus.ACTIVE, isActive: true, ...(vehicleType ? { vehicleType } : {}) },
      order: { createdAt: 'DESC' },
    });
    return serviceType
      ? items.filter((vehicle) => vehicle.serviceCapabilities?.includes(serviceType))
      : items;
  }

  async get(userId: string, id: string, allowPublic = false) {
    const vehicle = await this.vehicles.findOne({ where: { id } });
    if (!vehicle) throw new NotFoundException('Vehicle not found');
    const driver = await this.drivers.findOne({ where: { userId } });
    if (!allowPublic && vehicle.ownerUserId !== userId && vehicle.assignedDriverId !== driver?.id) {
      throw new ForbiddenException('You do not manage this vehicle');
    }
    const [documents, accessories] = await Promise.all([
      this.documents.find({ where: { vehicleId: id }, order: { createdAt: 'DESC' } }),
      this.accessories.find({ where: { vehicleId: id }, order: { category: 'ASC', code: 'ASC' } }),
    ]);
    return { vehicle, documents, accessories };
  }

  async create(userId: string, dto: CreateVehicleDto) {
    const normalizedPlate = dto.plateNumber.toString().trim().toUpperCase();
    if (!normalizedPlate) {
      throw new ConflictException('Plate number is required');
    }

    const driver = await this.drivers.findOne({ where: { userId } });

    // If this driver already has a vehicle with the same plate (including a
    // soft-deleted one left over from a previous failed onboarding attempt),
    // restore and update it instead of trying to insert a new row and hitting
    // the unique plate index.
    const existing = await this.vehicles.findOne({
      where: { plateNumber: normalizedPlate, ownerUserId: userId },
      withDeleted: true,
    });
    if (existing) {
      if (existing.deletedAt) {
        existing.deletedAt = null;
      }
      Object.assign(existing, {
        ...dto,
        plateNumber: normalizedPlate,
        assignedDriverId: driver?.id ?? existing.assignedDriverId,
        cargoCapacityKg: dto.cargoCapacityKg ?? existing.cargoCapacityKg ?? 0,
      });
      return this.vehicles.save(existing);
    }

    if (
      await this.vehicles.findOne({
        where: { plateNumber: normalizedPlate },
        withDeleted: true,
      })
    ) {
      throw new ConflictException('Plate number is already registered');
    }

    return this.vehicles.save(
      this.vehicles.create({
        ...dto,
        ownerUserId: userId,
        assignedDriverId: driver?.id,
        plateNumber: normalizedPlate,
        cargoCapacityKg: dto.cargoCapacityKg ?? 0,
        status: VehicleStatus.PENDING_VERIFICATION,
        isActive: false,
      }),
    );
  }

  async update(userId: string, id: string, dto: Partial<UpdateVehicleDto>) {
    const data = await this.get(userId, id);
    if (dto.plateNumber && dto.plateNumber.toUpperCase() !== data.vehicle.plateNumber) {
      if (await this.vehicles.findOne({ where: { plateNumber: dto.plateNumber.toUpperCase() } })) {
        throw new ConflictException('Plate number is already registered');
      }
    }
    Object.assign(data.vehicle, dto, dto.plateNumber ? { plateNumber: dto.plateNumber.toUpperCase() } : {});
    return this.vehicles.save(data.vehicle);
  }

  async remove(userId: string, id: string) {
    await this.get(userId, id);
    await this.vehicles.softDelete(id);
    return { deleted: true };
  }

  async activate(userId: string, id: string) {
    const { vehicle } = await this.get(userId, id);
    if (vehicle.status !== VehicleStatus.ACTIVE) {
      throw new ForbiddenException('Vehicle must be verified and active before selection');
    }
    const driver = await this.drivers.findOne({ where: { userId } });
    if (driver) {
      const related = await this.vehicles.find({
        where: [{ ownerUserId: userId }, { assignedDriverId: driver.id }],
      });
      await this.vehicles.update({ id: In(related.map((item) => item.id)) }, { isActive: false });
      driver.currentVehicleId = vehicle.id;
      await this.drivers.save(driver);
    } else {
      await this.vehicles.update({ ownerUserId: userId }, { isActive: false });
    }
    vehicle.isActive = true;
    return this.vehicles.save(vehicle);
  }

  async addDocument(userId: string, id: string, dto: VehicleDocumentDto): Promise<VehicleDocument> {
    await this.get(userId, id);
    const document = this.documents.create({
      vehicleId: id,
      type: dto.type,
      fileUrl: dto.fileUrl,
      issueDate: dto.issueDate ? new Date(dto.issueDate) : undefined,
      expiryDate: dto.expiryDate ? new Date(dto.expiryDate) : undefined,
      status: DocumentStatus.IN_REVIEW,
      metadata: dto.metadata,
    });
    const saved = await this.documents.save(document);
    return Array.isArray(saved) ? saved[0] : saved;
  }

  async setAccessories(userId: string, id: string, dto: SetAccessoriesDto) {
    await this.get(userId, id);
    await this.accessories.delete({ vehicleId: id });
    return this.accessories.save(
      dto.accessories.map((item) =>
        this.accessories.create({
          vehicleId: id,
          code: item.code,
          category: item.category,
          enabled: item.enabled ?? true,
          details: item.details,
        }),
      ),
    );
  }

  async isRentalAvailable(vehicleId: string, startsAt: Date, endsAt: Date): Promise<boolean> {
    const overlapping = await this.rentalBlocks
      .createQueryBuilder('block')
      .where('block.vehicleId = :vehicleId', { vehicleId })
      .andWhere('block.startsAt < :endsAt', { endsAt })
      .andWhere('block.endsAt > :startsAt', { startsAt })
      .getCount();
    return overlapping === 0;
  }
}
