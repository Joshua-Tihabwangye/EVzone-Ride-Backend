import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RideMode, ServiceType } from '../common/enums';
import { RiderCommute } from '../database/entities';
import { RidesService } from '../rides/rides.service';
import { BookCommuteDto, CreateCommuteDto, UpdateCommuteDto } from './commutes.dto';

@Injectable()
export class CommutesService {
  constructor(
    @InjectRepository(RiderCommute) private readonly commutes: Repository<RiderCommute>,
    private readonly rides: RidesService,
  ) {}

  create(userId: string, dto: CreateCommuteDto) {
    return this.commutes.save(
      this.commutes.create({
        userId,
        name: dto.name,
        serviceType: dto.serviceType ?? ServiceType.RIDE,
        pickup: dto.pickup,
        dropoff: dto.dropoff,
        stops: dto.stops,
        schedule: dto.schedule,
        preferences: dto.preferences,
        active: dto.active ?? true,
        nextRunAt: dto.nextRunAt ? new Date(dto.nextRunAt) : undefined,
      }),
    );
  }

  list(userId: string, active?: boolean) {
    return this.commutes.find({
      where: active === undefined ? { userId } : { userId, active },
      order: { nextRunAt: 'ASC', createdAt: 'DESC' },
    });
  }

  async detail(userId: string, id: string) {
    const commute = await this.commutes.findOne({ where: { id, userId } });
    if (!commute) throw new NotFoundException('Commute not found');
    return commute;
  }

  async update(userId: string, id: string, dto: UpdateCommuteDto) {
    const commute = await this.detail(userId, id);
    Object.assign(commute, dto);
    if (dto.nextRunAt) commute.nextRunAt = new Date(dto.nextRunAt);
    return this.commutes.save(commute);
  }

  async remove(userId: string, id: string) {
    const commute = await this.detail(userId, id);
    commute.active = false;
    await this.commutes.save(commute);
    return { id, active: false };
  }

  async book(userId: string, id: string, dto: BookCommuteDto) {
    const commute = await this.detail(userId, id);
    if (!commute.active) throw new BadRequestException('Commute is inactive');
    if (commute.serviceType !== ServiceType.RIDE) {
      throw new BadRequestException('Automatic booking currently supports ride commutes only');
    }
    const scheduledAt = dto.scheduledAt ?? commute.nextRunAt?.toISOString();
    const ride = await this.rides.create(userId, {
      pickup: commute.pickup,
      destination: commute.dropoff,
      stops: commute.stops,
      paymentMethod: dto.paymentMethod,
      scheduledAt,
      vehicleType: dto.vehicleType,
      category: dto.category,
      tripType: dto.tripType,
      passengerCount: dto.passengerCount,
      promoCode: dto.promoCode,
      preferences: { ...(commute.preferences ?? {}), ...(dto.preferences ?? {}), commuteId: commute.id },
      mode: scheduledAt ? RideMode.SCHEDULED : RideMode.ON_DEMAND,
    });
    commute.lastBookedAt = new Date();
    await this.commutes.save(commute);
    return ride;
  }
}
