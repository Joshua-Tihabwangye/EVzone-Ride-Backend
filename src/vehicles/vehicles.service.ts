import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { DocumentStatus, DocumentType, ServiceType, VehicleStatus, VehicleType } from '../common/enums';
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
    if (await this.vehicles.findOne({ where: { plateNumber: dto.plateNumber.toUpperCase() } })) {
      throw new ConflictException('Plate number is already registered');
    }
    const driver = await this.drivers.findOne({ where: { userId } });
    return this.vehicles.save(
      this.vehicles.create({
        ...dto,
        ownerUserId: userId,
        assignedDriverId: driver?.id,
        plateNumber: dto.plateNumber.toUpperCase(),
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

  listDocuments(vehicleId: string) {
    return this.documents.find({ where: { vehicleId }, order: { createdAt: 'DESC' } });
  }

  async addDocument(userId: string, id: string, dto: VehicleDocumentDto) {
    await this.get(userId, id);
    const autoVerify = (process.env.AUTO_VERIFY_DRIVER_DOCUMENTS ?? 'true') === 'true';
    const document = await this.documents.save(
      this.documents.create({
        vehicleId: id,
        type: dto.type,
        fileUrl: dto.fileUrl,
        issueDate: dto.issueDate ? new Date(dto.issueDate) : undefined,
        expiryDate: dto.expiryDate ? new Date(dto.expiryDate) : undefined,
        status: autoVerify ? DocumentStatus.VERIFIED : DocumentStatus.IN_REVIEW,
      }),
    );
    // Auto-activate the vehicle once all required docs are uploaded and verified.
    await this.autoActivateVehicleIfReady(userId, id);
    return document;
  }

  async updateDocument(
    userId: string,
    vehicleId: string,
    documentId: string,
    patch: Partial<VehicleDocumentDto>,
  ) {
    await this.get(userId, vehicleId);
    const document = await this.documents.findOne({ where: { id: documentId, vehicleId } });
    if (!document) throw new NotFoundException('Vehicle document not found');
    if (patch.type) document.type = patch.type;
    if (patch.fileUrl !== undefined) document.fileUrl = patch.fileUrl;
    if (patch.issueDate) document.issueDate = new Date(patch.issueDate);
    if (patch.expiryDate) document.expiryDate = new Date(patch.expiryDate);
    const updated = await this.documents.save(document);
    // A patch may fix an expiry date, so re-evaluate vehicle activation.
    await this.autoActivateVehicleIfReady(userId, vehicleId);
    return updated;
  }

  private async autoActivateVehicleIfReady(userId: string, vehicleId: string) {
    const { vehicle } = await this.get(userId, vehicleId);
    if (vehicle.status === VehicleStatus.ACTIVE && vehicle.isActive) {
      return;
    }
    const documents = await this.documents.find({ where: { vehicleId } });
    const now = new Date();
    const requiredTypes = [DocumentType.VEHICLE_INSURANCE, DocumentType.VEHICLE_INSPECTION];
    const allReady = requiredTypes.every((type) =>
      documents.some(
        (d) =>
          d.type === type &&
          d.status === DocumentStatus.VERIFIED &&
          (!d.expiryDate || d.expiryDate > now),
      ),
    );
    if (allReady) {
      vehicle.status = VehicleStatus.ACTIVE;
      vehicle.isActive = true;
      await this.vehicles.save(vehicle);
      // Make this vehicle the driver's current vehicle if none is selected.
      const driver = await this.drivers.findOne({ where: { userId } });
      if (driver && !driver.currentVehicleId) {
        driver.currentVehicleId = vehicle.id;
        await this.drivers.save(driver);
      }
    }
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
