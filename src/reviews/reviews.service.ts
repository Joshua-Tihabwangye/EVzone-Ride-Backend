import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserRole } from '../common/enums';
import { AuthUser } from '../common/interfaces';
import { DriverProfile, ServiceReview } from '../database/entities';
import { CreateReviewDto, ModerateReviewDto, ReportReviewDto, RespondReviewDto } from './reviews.dto';

@Injectable()
export class ReviewsService {
  constructor(
    @InjectRepository(ServiceReview) private readonly reviews: Repository<ServiceReview>,
    @InjectRepository(DriverProfile) private readonly drivers: Repository<DriverProfile>,
    private readonly events: EventEmitter2,
  ) {}

  async create(user: AuthUser, dto: CreateReviewDto) {
    let review = await this.reviews.findOne({
      where: {
        serviceType: dto.serviceType,
        serviceId: dto.serviceId,
        reviewerUserId: user.id,
      },
    });
    review ??= this.reviews.create({
      serviceType: dto.serviceType,
      serviceId: dto.serviceId,
      reviewerUserId: user.id,
      reviewerRole: user.role,
    });
    review.revieweeUserId = dto.revieweeUserId ?? review.revieweeUserId;
    review.rating = dto.rating;
    review.categoryRatings = dto.categoryRatings;
    review.tags = dto.tags;
    review.comment = dto.comment;
    review.visibility = dto.visibility?.toUpperCase() ?? review.visibility ?? 'PUBLIC';
    review.metadata = { ...(review.metadata ?? {}), ...(dto.metadata ?? {}) };
    review.status = 'PUBLISHED';
    review = await this.reviews.save(review);
    await this.refreshDriverRating(review.revieweeUserId);
    this.events.emit('domain.event', {
      topic: 'reviews',
      eventType: 'review.saved',
      aggregateType: 'ServiceReview',
      aggregateId: review.id,
      eventKey: `${review.serviceType}:${review.serviceId}`,
      payload: review,
    });
    return review;
  }

  async mine(userId: string, mode = 'written', page = 1, limit = 20) {
    const where = mode === 'received' ? { revieweeUserId: userId } : { reviewerUserId: userId };
    const [items, total] = await this.reviews.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { items, meta: { page, limit, total, pageCount: Math.ceil(total / limit) } };
  }

  async forService(serviceType: string, serviceId: string, page = 1, limit = 20) {
    const query = this.reviews
      .createQueryBuilder('review')
      .where('review.serviceType = :serviceType', { serviceType })
      .andWhere('review.serviceId = :serviceId', { serviceId })
      .andWhere('review.status = :status', { status: 'PUBLISHED' })
      .andWhere('review.visibility = :visibility', { visibility: 'PUBLIC' })
      .orderBy('review.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);
    const [items, total] = await query.getManyAndCount();
    return {
      items,
      summary: this.summaryFor(items, total),
      meta: { page, limit, total, pageCount: Math.ceil(total / limit) },
    };
  }

  async userSummary(userId: string) {
    const items = await this.reviews.find({
      where: { revieweeUserId: userId, status: 'PUBLISHED', visibility: 'PUBLIC' },
      order: { createdAt: 'DESC' },
      take: 1000,
    });
    return this.summaryFor(items, items.length);
  }

  async respond(user: AuthUser, id: string, dto: RespondReviewDto) {
    const review = await this.get(id);
    const elevated = [UserRole.ADMIN, UserRole.SUPPORT].includes(user.role);
    if (!elevated && review.revieweeUserId !== user.id) {
      throw new ForbiddenException('Only the reviewed user or an administrator can respond');
    }
    review.response = dto.response;
    review.respondedByUserId = user.id;
    review.respondedAt = new Date();
    return this.reviews.save(review);
  }

  async report(userId: string, id: string, dto: ReportReviewDto) {
    const review = await this.get(id);
    review.reportedByUserId = userId;
    review.reportReason = dto.reason;
    review.reportedAt = new Date();
    review.status = 'REPORTED';
    return this.reviews.save(review);
  }

  async moderate(userId: string, id: string, dto: ModerateReviewDto) {
    const review = await this.get(id);
    review.status = dto.status?.toUpperCase() ?? review.status;
    review.visibility = dto.visibility?.toUpperCase() ?? review.visibility;
    review.moderatedByUserId = userId;
    review.moderatedAt = new Date();
    review.metadata = { ...(review.metadata ?? {}), moderationNote: dto.note };
    const saved = await this.reviews.save(review);
    await this.refreshDriverRating(saved.revieweeUserId);
    return saved;
  }

  async remove(user: AuthUser, id: string) {
    const review = await this.get(id);
    const elevated = [UserRole.ADMIN, UserRole.SUPPORT].includes(user.role);
    if (!elevated && review.reviewerUserId !== user.id) {
      throw new ForbiddenException('You cannot remove this review');
    }
    await this.reviews.softDelete({ id });
    await this.refreshDriverRating(review.revieweeUserId);
    return { deleted: true };
  }

  private async get(id: string) {
    const review = await this.reviews.findOne({ where: { id } });
    if (!review) throw new NotFoundException('Review not found');
    return review;
  }

  private summaryFor(items: ServiceReview[], total: number) {
    const average = items.length
      ? items.reduce((sum, item) => sum + Number(item.rating), 0) / items.length
      : 0;
    const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } as Record<number, number>;
    for (const item of items) distribution[Math.min(5, Math.max(1, item.rating))] += 1;
    return { averageRating: Number(average.toFixed(2)), ratingsCount: total, distribution };
  }

  private async refreshDriverRating(userId?: string) {
    if (!userId) return;
    const driver = await this.drivers.findOne({ where: { userId } });
    if (!driver) return;
    const items = await this.reviews.find({
      where: { revieweeUserId: userId, status: 'PUBLISHED' },
      take: 10000,
    });
    driver.ratingsCount = items.length;
    driver.rating = items.length
      ? Number((items.reduce((sum, item) => sum + Number(item.rating), 0) / items.length).toFixed(2))
      : 5;
    await this.drivers.save(driver);
  }
}
