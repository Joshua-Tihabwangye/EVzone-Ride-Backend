import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserPlace } from '../database/entities';
import { PinPlaceDto, RecordPlaceDto, UpdatePlaceDto } from './places.dto';

@Injectable()
export class PlacesService {
  constructor(@InjectRepository(UserPlace) private readonly places: Repository<UserPlace>) {}

  async record(userId: string, dto: RecordPlaceDto) {
    let place: UserPlace | null = null;
    if (dto.providerPlaceId) {
      place = await this.places.findOne({ where: { userId, providerPlaceId: dto.providerPlaceId } });
    }
    place ??= await this.places.findOne({ where: { userId, address: dto.address } });
    if (!place) {
      place = this.places.create({
        userId,
        label: dto.label,
        address: dto.address,
        providerPlaceId: dto.providerPlaceId,
        latitude: dto.latitude,
        longitude: dto.longitude,
        source: dto.source?.toUpperCase() ?? 'SEARCH',
        pinned: dto.pinned ?? false,
        pinLabel: dto.pinLabel,
        useCount: 1,
        lastUsedAt: new Date(),
        lastServiceType: dto.serviceType,
        metadata: dto.metadata,
      });
    } else {
      place.label = dto.label;
      place.address = dto.address;
      place.providerPlaceId = dto.providerPlaceId ?? place.providerPlaceId;
      place.latitude = dto.latitude;
      place.longitude = dto.longitude;
      place.source = dto.source?.toUpperCase() ?? place.source;
      place.pinned = dto.pinned ?? place.pinned;
      place.pinLabel = dto.pinLabel ?? place.pinLabel;
      place.useCount += 1;
      place.lastUsedAt = new Date();
      place.lastServiceType = dto.serviceType ?? place.lastServiceType;
      place.metadata = { ...(place.metadata ?? {}), ...(dto.metadata ?? {}) };
    }
    return this.places.save(place);
  }

  async list(userId: string, scope = 'all', page = 1, limit = 30) {
    const query = this.places.createQueryBuilder('place').where('place.userId = :userId', { userId });
    if (scope === 'pinned') query.andWhere('place.pinned = :pinned', { pinned: true });
    if (scope === 'recent') query.andWhere('place.lastUsedAt IS NOT NULL');
    const order = scope === 'pinned' ? 'place.pinLabel' : 'place.lastUsedAt';
    query
      .orderBy(order, scope === 'pinned' ? 'ASC' : 'DESC')
      .addOrderBy('place.createdAt', 'DESC')
      .skip((Math.max(page, 1) - 1) * limit)
      .take(limit);
    const [items, total] = await query.getManyAndCount();
    return {
      items,
      meta: {
        page: Math.max(page, 1),
        limit,
        total,
        pageCount: Math.ceil(total / limit),
      },
    };
  }

  async get(userId: string, id: string) {
    const place = await this.places.findOne({ where: { id, userId } });
    if (!place) throw new NotFoundException('Place not found');
    return place;
  }

  async update(userId: string, id: string, dto: UpdatePlaceDto) {
    const place = await this.get(userId, id);
    Object.assign(place, dto);
    if (dto.metadata) place.metadata = { ...(place.metadata ?? {}), ...dto.metadata };
    return this.places.save(place);
  }

  async markUsed(userId: string, id: string) {
    const place = await this.get(userId, id);
    place.useCount += 1;
    place.lastUsedAt = new Date();
    return this.places.save(place);
  }

  async pin(userId: string, id: string, dto: PinPlaceDto) {
    const place = await this.get(userId, id);
    place.pinned = true;
    place.pinLabel = dto.label ?? place.pinLabel ?? place.label;
    return this.places.save(place);
  }

  async unpin(userId: string, id: string) {
    const place = await this.get(userId, id);
    place.pinned = false;
    place.pinLabel = undefined;
    return this.places.save(place);
  }

  async remove(userId: string, id: string) {
    const result = await this.places.softDelete({ id, userId });
    if (!result.affected) throw new NotFoundException('Place not found');
    return { deleted: true };
  }
}
