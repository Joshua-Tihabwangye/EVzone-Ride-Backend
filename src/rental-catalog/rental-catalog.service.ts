import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserRole } from '../common/enums';
import { AuthUser } from '../common/interfaces';
import { CustomRentalRequest, RentalBranch, RentalVehicleClass, Vehicle } from '../database/entities';
import { NotificationsService } from '../notifications/notifications.service';
import {
  CreateCustomRentalRequestDto,
  CreateRentalBranchDto,
  CreateRentalVehicleClassDto,
  QuoteCustomRentalRequestDto,
  RejectCustomRentalRequestDto,
  UpdateRentalBranchDto,
  UpdateRentalVehicleClassDto,
} from './rental-catalog.dto';

@Injectable()
export class RentalCatalogService {
  constructor(
    @InjectRepository(RentalBranch) private readonly branches: Repository<RentalBranch>,
    @InjectRepository(RentalVehicleClass) private readonly classes: Repository<RentalVehicleClass>,
    @InjectRepository(CustomRentalRequest)
    private readonly requests: Repository<CustomRentalRequest>,
    @InjectRepository(Vehicle) private readonly vehicles: Repository<Vehicle>,
    private readonly notifications: NotificationsService,
    private readonly events: EventEmitter2,
  ) {}

  listBranches(city?: string) {
    const query = this.branches
      .createQueryBuilder('branch')
      .where('branch.active = :active', { active: true })
      .orderBy('branch.name', 'ASC');
    if (city) query.andWhere('LOWER(branch.address) LIKE LOWER(:city)', { city: `%${city}%` });
    return query.getMany();
  }

  async branch(id: string) {
    const branch = await this.branches.findOne({ where: { id } });
    if (!branch) throw new NotFoundException('Rental branch not found');
    return {
      branch,
      vehicleClasses: await this.classes.find({
        where: { branchId: id, active: true },
        order: { name: 'ASC' },
      }),
    };
  }

  async createBranch(user: AuthUser, dto: CreateRentalBranchDto) {
    const existing = await this.branches.findOne({ where: { code: dto.code.toUpperCase() } });
    if (existing) throw new BadRequestException('Rental branch code already exists');
    return this.branches.save(
      this.branches.create({
        ...dto,
        code: dto.code.toUpperCase(),
        operatorUserId: user.id,
        timezone: dto.timezone ?? 'Africa/Kampala',
        active: dto.active ?? true,
      }),
    );
  }

  async updateBranch(user: AuthUser, id: string, dto: UpdateRentalBranchDto) {
    const branch = await this.getBranch(id);
    this.assertOperator(user, branch.operatorUserId);
    Object.assign(branch, dto);
    return this.branches.save(branch);
  }

  async listClasses(branchId?: string, vehicleType?: string) {
    const query = this.classes
      .createQueryBuilder('class')
      .where('class.active = :active', { active: true })
      .orderBy('class.name', 'ASC');
    if (branchId) query.andWhere('class.branchId = :branchId', { branchId });
    const items = await query.getMany();
    return vehicleType
      ? items.filter((item) => item.vehicleTypes.some((type) => String(type) === vehicleType))
      : items;
  }

  async vehicleClass(id: string) {
    const vehicleClass = await this.classes.findOne({ where: { id, active: true } });
    if (!vehicleClass) throw new NotFoundException('Rental vehicle class not found');
    const vehicles = await this.vehicles.find({ where: { isActive: true } });
    return {
      vehicleClass,
      vehicles: vehicles.filter((vehicle) => vehicleClass.vehicleTypes.includes(vehicle.vehicleType)),
    };
  }

  async createClass(user: AuthUser, dto: CreateRentalVehicleClassDto) {
    const existing = await this.classes.findOne({ where: { code: dto.code.toUpperCase() } });
    if (existing) throw new BadRequestException('Rental vehicle class code already exists');
    if (dto.branchId) {
      const branch = await this.getBranch(dto.branchId);
      this.assertOperator(user, branch.operatorUserId);
    }
    return this.classes.save(
      this.classes.create({
        ...dto,
        code: dto.code.toUpperCase(),
        operatorUserId: user.id,
        minimumSeats: dto.minimumSeats ?? 1,
        maximumPassengers: dto.maximumPassengers ?? 4,
        luggageCapacity: dto.luggageCapacity ?? 0,
        active: dto.active ?? true,
      }),
    );
  }

  async updateClass(user: AuthUser, id: string, dto: UpdateRentalVehicleClassDto) {
    const vehicleClass = await this.classes.findOne({ where: { id } });
    if (!vehicleClass) throw new NotFoundException('Rental vehicle class not found');
    this.assertOperator(user, vehicleClass.operatorUserId);
    Object.assign(vehicleClass, dto);
    return this.classes.save(vehicleClass);
  }

  async createRequest(userId: string, dto: CreateCustomRentalRequestDto) {
    const pickupAt = new Date(dto.pickupAt);
    const returnAt = new Date(dto.returnAt);
    if (pickupAt <= new Date() || returnAt <= pickupAt) {
      throw new BadRequestException('Custom rental dates are invalid');
    }
    if (dto.branchId) await this.getBranch(dto.branchId);
    if (dto.vehicleClassId) {
      const vehicleClass = await this.classes.findOne({ where: { id: dto.vehicleClassId, active: true } });
      if (!vehicleClass) throw new NotFoundException('Rental vehicle class not found');
    }
    const request = await this.requests.save(
      this.requests.create({
        renterId: userId,
        branchId: dto.branchId,
        requestedVehicleClassId: dto.vehicleClassId,
        pickupAt,
        returnAt,
        pickupLocation: dto.pickupLocation,
        returnLocation: dto.returnLocation,
        passengerCount: dto.passengerCount ?? 1,
        luggageCount: dto.luggageCount ?? 0,
        withDriver: dto.withDriver ?? false,
        requirements: dto.requirements,
        budgetAmount: dto.budgetAmount,
        currency: dto.currency ?? 'UGX',
        paymentMethod: dto.paymentMethod,
        status: 'REQUESTED',
      }),
    );
    this.emit(request, 'custom-rental.requested');
    return request;
  }

  async listRequests(user: AuthUser, status?: string, page = 1, limit = 20) {
    const query = this.requests.createQueryBuilder('request');
    if ([UserRole.ADMIN, UserRole.SUPPORT].includes(user.role)) query.where('1=1');
    else if ([UserRole.RENTAL_PARTNER, UserRole.FLEET_PARTNER, UserRole.FLEET_MANAGER].includes(user.role)) {
      const ownedBranches = await this.branches.find({ where: { operatorUserId: user.id } });
      if (!ownedBranches.length) query.where('request.renterId = :userId', { userId: user.id });
      else
        query.where('request.branchId IN (:...branchIds)', {
          branchIds: ownedBranches.map((item) => item.id),
        });
    } else query.where('request.renterId = :userId', { userId: user.id });
    if (status) query.andWhere('request.status = :status', { status: status.toUpperCase() });
    query
      .orderBy('request.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);
    const [items, total] = await query.getManyAndCount();
    return { items, meta: { page, limit, total, pageCount: Math.ceil(total / limit) } };
  }

  async requestDetail(user: AuthUser, id: string) {
    const request = await this.getRequest(id);
    await this.assertRequestAccess(user, request);
    const [branch, vehicleClass, vehicle] = await Promise.all([
      request.branchId ? this.branches.findOne({ where: { id: request.branchId } }) : null,
      request.requestedVehicleClassId
        ? this.classes.findOne({ where: { id: request.requestedVehicleClassId } })
        : null,
      request.quotedVehicleId ? this.vehicles.findOne({ where: { id: request.quotedVehicleId } }) : null,
    ]);
    return { request, branch, vehicleClass, quotedVehicle: vehicle };
  }

  async quote(user: AuthUser, id: string, dto: QuoteCustomRentalRequestDto) {
    const request = await this.getRequest(id);
    if (!['REQUESTED', 'QUOTED'].includes(request.status)) {
      throw new BadRequestException('Custom rental request cannot be quoted now');
    }
    if (request.branchId) {
      const branch = await this.getBranch(request.branchId);
      this.assertOperator(user, branch.operatorUserId);
    } else if (
      ![UserRole.ADMIN, UserRole.SUPPORT, UserRole.RENTAL_PARTNER, UserRole.FLEET_PARTNER].includes(user.role)
    ) {
      throw new ForbiddenException('You cannot quote this request');
    }
    if (dto.vehicleId) {
      const vehicle = await this.vehicles.findOne({ where: { id: dto.vehicleId } });
      if (!vehicle) throw new NotFoundException('Quoted vehicle not found');
      request.quotedVehicleId = vehicle.id;
    }
    request.quoteAmount = dto.quoteAmount;
    request.quoteExpiresAt = dto.expiresAt
      ? new Date(dto.expiresAt)
      : new Date(Date.now() + 48 * 60 * 60 * 1000);
    request.quotedByUserId = user.id;
    request.quotedAt = new Date();
    request.status = 'QUOTED';
    request.requirements = { ...(request.requirements ?? {}), quoteDetails: dto.details };
    const saved = await this.requests.save(request);
    await this.notifications.create({
      userId: request.renterId,
      title: 'Custom rental quotation ready',
      body: `Your custom rental quotation is ${request.currency} ${dto.quoteAmount.toLocaleString()}.`,
      data: { customRentalRequestId: request.id, quoteExpiresAt: request.quoteExpiresAt },
    });
    this.emit(saved, 'custom-rental.quoted');
    return saved;
  }

  async accept(userId: string, id: string) {
    const request = await this.requests.findOne({ where: { id, renterId: userId } });
    if (!request) throw new NotFoundException('Custom rental request not found');
    if (request.status !== 'QUOTED') throw new BadRequestException('Quotation is not available');
    if (!request.quoteAmount || !request.quoteExpiresAt || request.quoteExpiresAt <= new Date()) {
      throw new BadRequestException('Quotation has expired');
    }
    request.status = 'ACCEPTED';
    request.acceptedAt = new Date();
    const saved = await this.requests.save(request);
    this.emit(saved, 'custom-rental.accepted');
    return saved;
  }

  async reject(user: AuthUser, id: string, dto: RejectCustomRentalRequestDto) {
    const request = await this.getRequest(id);
    await this.assertRequestAccess(user, request);
    if (['ACCEPTED', 'CANCELLED', 'REJECTED'].includes(request.status)) {
      throw new BadRequestException('Custom rental request cannot be rejected now');
    }
    request.status = request.renterId === user.id ? 'CANCELLED' : 'REJECTED';
    request.rejectionReason = dto.reason;
    request.rejectedAt = new Date();
    const saved = await this.requests.save(request);
    this.emit(saved, 'custom-rental.rejected');
    return saved;
  }

  private async getBranch(id: string) {
    const branch = await this.branches.findOne({ where: { id } });
    if (!branch) throw new NotFoundException('Rental branch not found');
    return branch;
  }

  private async getRequest(id: string) {
    const request = await this.requests.findOne({ where: { id } });
    if (!request) throw new NotFoundException('Custom rental request not found');
    return request;
  }

  private assertOperator(user: AuthUser, operatorUserId?: string) {
    if ([UserRole.ADMIN, UserRole.SUPPORT].includes(user.role)) return;
    if (operatorUserId === user.id) return;
    throw new ForbiddenException('Rental resource belongs to another operator');
  }

  private async assertRequestAccess(user: AuthUser, request: CustomRentalRequest) {
    if ([UserRole.ADMIN, UserRole.SUPPORT].includes(user.role) || request.renterId === user.id) return;
    if (request.branchId) {
      const branch = await this.getBranch(request.branchId);
      if (branch.operatorUserId === user.id) return;
    }
    throw new ForbiddenException('You cannot access this custom rental request');
  }

  private emit(request: CustomRentalRequest, eventType: string) {
    this.events.emit('domain.event', {
      topic: 'rentals',
      eventType,
      aggregateType: 'CustomRentalRequest',
      aggregateId: request.id,
      eventKey: request.id,
      payload: request,
    });
    this.events.emit('user.event', {
      userId: request.renterId,
      event: eventType,
      data: request,
    });
  }
}
