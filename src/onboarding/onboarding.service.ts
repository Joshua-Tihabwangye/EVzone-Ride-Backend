import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DriverVerificationStatus } from '../common/enums';
import {
  DriverProfile,
  EmergencyContact,
  OnboardingApplication,
  OnboardingChecklistItem,
  UserDocument,
} from '../database/entities';
import {
  CompleteChecklistItemDto,
  CreateEmergencyContactDto,
  ReviewOnboardingDto,
  ReviewUserDocumentDto,
  StartOnboardingDto,
  UpdateOnboardingDto,
  UploadUserDocumentDto,
} from './onboarding.dto';

const CHECKLISTS: Record<string, Array<{ key: string; label: string; required: boolean }>> = {
  DRIVER: [
    { key: 'PROFILE', label: 'Personal profile', required: true },
    { key: 'IDENTITY', label: 'Identity and selfie verification', required: true },
    { key: 'DRIVER_DOCUMENTS', label: 'Driving permit and professional documents', required: true },
    { key: 'VEHICLE', label: 'Vehicle registration and compliance', required: true },
    { key: 'BANK_DETAILS', label: 'Payout details', required: true },
    { key: 'TRAINING', label: 'Driver information session and quiz', required: true },
  ],
  FLEET_PARTNER: [
    { key: 'BUSINESS_PROFILE', label: 'Business profile', required: true },
    { key: 'KYC', label: 'Business KYC documents', required: true },
    { key: 'FLEET_SETUP', label: 'Initial fleet setup', required: true },
    { key: 'BANK_DETAILS', label: 'Settlement account', required: true },
  ],
  AGENT_DISPATCHER: [
    { key: 'PROFILE', label: 'Agent or dispatcher profile', required: true },
    { key: 'KYC', label: 'Identity verification', required: true },
    { key: 'DESK_SETUP', label: 'Dispatch desk configuration', required: true },
  ],
  TOUR_OPERATOR: [
    { key: 'BUSINESS_PROFILE', label: 'Tour operator profile', required: true },
    { key: 'KYC', label: 'Operator licences and KYC', required: true },
    { key: 'FLEET_SETUP', label: 'Tourist vehicle fleet', required: true },
  ],
  RENTAL_PARTNER: [
    { key: 'BUSINESS_PROFILE', label: 'Rental business profile', required: true },
    { key: 'KYC', label: 'Rental partner KYC', required: true },
    { key: 'FLEET_SETUP', label: 'Rental vehicle fleet', required: true },
  ],
  MEDICAL_PARTNER: [
    { key: 'FACILITY_PROFILE', label: 'Medical facility profile', required: true },
    { key: 'LICENSING', label: 'Medical and ambulance licences', required: true },
    { key: 'FLEET_SETUP', label: 'Ambulance fleet setup', required: true },
  ],
};

@Injectable()
export class OnboardingService {
  constructor(
    @InjectRepository(OnboardingApplication)
    private readonly applications: Repository<OnboardingApplication>,
    @InjectRepository(OnboardingChecklistItem)
    private readonly checklist: Repository<OnboardingChecklistItem>,
    @InjectRepository(UserDocument) private readonly documents: Repository<UserDocument>,
    @InjectRepository(EmergencyContact) private readonly contacts: Repository<EmergencyContact>,
    @InjectRepository(DriverProfile) private readonly drivers: Repository<DriverProfile>,
  ) {}

  async start(userId: string, dto: StartOnboardingDto) {
    const existing = await this.applications.findOne({
      where: { userId, applicationType: dto.applicationType },
      order: { createdAt: 'DESC' },
    });
    if (existing && !['REJECTED', 'WITHDRAWN'].includes(existing.status)) {
      return this.detail(userId, existing.id);
    }
    const application = await this.applications.save(
      this.applications.create({
        userId,
        applicationType: dto.applicationType,
        status: 'DRAFT',
        completionPercent: 0,
        profileData: dto.profileData,
      }),
    );
    const template = CHECKLISTS[dto.applicationType] ?? [
      { key: 'PROFILE', label: 'Profile', required: true },
      { key: 'KYC', label: 'KYC verification', required: true },
    ];
    await this.checklist.save(
      template.map((item) => this.checklist.create({ applicationId: application.id, ...item })),
    );
    return this.detail(userId, application.id);
  }

  list(userId: string) {
    return this.applications.find({ where: { userId }, order: { createdAt: 'DESC' } });
  }

  adminList(status?: string, applicationType?: string) {
    return this.applications.find({
      where: {
        ...(status ? { status } : {}),
        ...(applicationType ? { applicationType } : {}),
      },
      order: { createdAt: 'DESC' },
      take: 500,
    });
  }

  async detail(userId: string, id: string, admin = false) {
    const application = await this.applications.findOne({
      where: admin ? { id } : { id, userId },
    });
    if (!application) throw new NotFoundException('Onboarding application not found');
    const [items, documents] = await Promise.all([
      this.checklist.find({ where: { applicationId: id }, order: { createdAt: 'ASC' } }),
      this.documents.find({ where: { userId: application.userId }, order: { createdAt: 'DESC' } }),
    ]);
    return { application, checklist: items, documents };
  }

  async update(userId: string, id: string, dto: UpdateOnboardingDto) {
    const application = await this.ownedApplication(userId, id);
    this.assertEditable(application);
    application.profileData = { ...(application.profileData ?? {}), ...(dto.profileData ?? {}) };
    if (application.status === 'DRAFT') application.status = 'IN_PROGRESS';
    await this.applications.save(application);
    return this.detail(userId, id);
  }

  async completeItem(userId: string, applicationId: string, key: string, dto: CompleteChecklistItemDto) {
    const application = await this.ownedApplication(userId, applicationId);
    this.assertEditable(application);
    const item = await this.checklist.findOne({ where: { applicationId, key } });
    if (!item) throw new NotFoundException('Checklist item not found');
    item.status = dto.status;
    item.data = dto.data;
    item.completedAt = ['COMPLETED', 'WAIVED'].includes(dto.status) ? new Date() : undefined;
    await this.checklist.save(item);
    await this.recalculate(application);
    return this.detail(userId, applicationId);
  }

  async submit(userId: string, id: string) {
    const application = await this.ownedApplication(userId, id);
    this.assertEditable(application);
    const items = await this.checklist.find({ where: { applicationId: id } });
    const incomplete = items.filter(
      (item) => item.required && !['COMPLETED', 'WAIVED'].includes(item.status),
    );
    if (incomplete.length) {
      throw new BadRequestException({
        message: 'Required onboarding steps are incomplete',
        incomplete: incomplete.map((item) => item.key),
      });
    }
    application.status = 'SUBMITTED';
    application.completionPercent = 100;
    application.submittedAt = new Date();
    await this.applications.save(application);
    return this.detail(userId, id);
  }

  async review(id: string, reviewerId: string, dto: ReviewOnboardingDto) {
    const application = await this.applications.findOne({ where: { id } });
    if (!application) throw new NotFoundException('Onboarding application not found');
    if (!['SUBMITTED', 'IN_REVIEW', 'NEEDS_CHANGES'].includes(application.status)) {
      throw new ConflictException('Application is not ready for review');
    }
    application.status = dto.status;
    application.reviewNotes = dto.reviewNotes;
    application.reviewedAt = new Date();
    application.reviewedByUserId = reviewerId;
    await this.applications.save(application);

    if (dto.status === 'APPROVED' && application.applicationType === 'DRIVER') {
      const driver = await this.drivers.findOne({ where: { userId: application.userId } });
      if (driver) {
        driver.verificationStatus = DriverVerificationStatus.VERIFIED;
        await this.drivers.save(driver);
      }
    }
    return this.detail(application.userId, id, true);
  }

  uploadDocument(userId: string, dto: UploadUserDocumentDto) {
    return this.documents.save(
      this.documents.create({
        userId,
        userType: dto.userType ?? 'USER',
        documentType: dto.documentType,
        fileUrl: dto.fileUrl,
        fileKey: dto.fileKey,
        originalFileName: dto.originalFileName,
        mimeType: dto.mimeType,
        sizeBytes: dto.sizeBytes,
        side: dto.side,
        issuedAt: dto.issuedAt ? new Date(dto.issuedAt) : undefined,
        expiryDate: dto.expiryDate ? new Date(dto.expiryDate) : undefined,
        status: 'IN_REVIEW',
        metadata: dto.metadata,
      }),
    );
  }

  listDocuments(userId: string, documentType?: string) {
    return this.documents.find({
      where: documentType ? { userId, documentType } : { userId },
      order: { createdAt: 'DESC' },
    });
  }

  adminListDocuments(status?: string, userId?: string) {
    return this.documents.find({
      where: { ...(status ? { status } : {}), ...(userId ? { userId } : {}) },
      order: { createdAt: 'DESC' },
      take: 500,
    });
  }

  async reviewDocument(id: string, reviewerId: string, dto: ReviewUserDocumentDto) {
    const document = await this.documents.findOne({ where: { id } });
    if (!document) throw new NotFoundException('Document not found');
    document.status = dto.status;
    document.rejectionReason = dto.status === 'REJECTED' ? dto.rejectionReason : undefined;
    document.verifiedAt = dto.status === 'VERIFIED' ? new Date() : undefined;
    document.verifiedByUserId = dto.status === 'VERIFIED' ? reviewerId : undefined;
    return this.documents.save(document);
  }

  listContacts(userId: string) {
    return this.contacts.find({ where: { userId }, order: { isPrimary: 'DESC', createdAt: 'ASC' } });
  }

  async createContact(userId: string, dto: CreateEmergencyContactDto) {
    const count = await this.contacts.count({ where: { userId } });
    const primary = dto.isPrimary === true || count === 0;
    if (primary) await this.contacts.update({ userId }, { isPrimary: false });
    return this.contacts.save(this.contacts.create({ userId, ...dto, isPrimary: primary }));
  }

  async removeContact(userId: string, id: string) {
    const contact = await this.contacts.findOne({ where: { id, userId } });
    if (!contact) throw new NotFoundException('Emergency contact not found');
    await this.contacts.softRemove(contact);
    return { id, deleted: true };
  }

  private async ownedApplication(userId: string, id: string) {
    const application = await this.applications.findOne({ where: { id, userId } });
    if (!application) throw new NotFoundException('Onboarding application not found');
    return application;
  }

  private assertEditable(application: OnboardingApplication) {
    if (['SUBMITTED', 'IN_REVIEW', 'APPROVED'].includes(application.status)) {
      throw new ConflictException('Onboarding application is locked for review');
    }
  }

  private async recalculate(application: OnboardingApplication) {
    const items = await this.checklist.find({ where: { applicationId: application.id } });
    const complete = items.filter((item) => ['COMPLETED', 'WAIVED'].includes(item.status)).length;
    application.completionPercent = items.length ? Math.round((complete / items.length) * 100) : 0;
    application.status = application.completionPercent ? 'IN_PROGRESS' : 'DRAFT';
    await this.applications.save(application);
  }
}
