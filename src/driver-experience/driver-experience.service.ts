import { Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { Repository } from 'typeorm';
import { TrainingProgressStatus } from '../common/enums';
import {
  DriverProfile,
  DriverTrainingAssessment,
  DriverTrainingCertificate,
  TrainingModule,
  TrainingProgress,
} from '../database/entities';
import { DriversService } from '../drivers/drivers.service';
import { NotificationsService } from '../notifications/notifications.service';
import { SubmitTrainingAssessmentDto, UpdateDriverPreferencesDto } from './driver-experience.dto';

@Injectable()
export class DriverExperienceService {
  constructor(
    @InjectRepository(DriverProfile) private readonly profiles: Repository<DriverProfile>,
    @InjectRepository(TrainingModule) private readonly modules: Repository<TrainingModule>,
    @InjectRepository(TrainingProgress) private readonly progress: Repository<TrainingProgress>,
    @InjectRepository(DriverTrainingAssessment)
    private readonly assessments: Repository<DriverTrainingAssessment>,
    @InjectRepository(DriverTrainingCertificate)
    private readonly certificates: Repository<DriverTrainingCertificate>,
    private readonly drivers: DriversService,
    private readonly notifications: NotificationsService,
    private readonly events: EventEmitter2,
  ) {}

  async preferences(userId: string) {
    const driver = await this.drivers.getByUserId(userId);
    return {
      serviceCapabilities: driver.serviceCapabilities ?? [],
      preferences: driver.preferences ?? {},
    };
  }

  async updatePreferences(userId: string, dto: UpdateDriverPreferencesDto) {
    const driver = await this.drivers.getByUserId(userId);
    if (dto.serviceCapabilities) driver.serviceCapabilities = dto.serviceCapabilities;
    driver.preferences = {
      ...(driver.preferences ?? {}),
      ...(dto.servicePreferences ? { servicePreferences: dto.servicePreferences } : {}),
      ...(dto.interactionPreferences ? { interactionPreferences: dto.interactionPreferences } : {}),
      ...(dto.schedulePreferences ? { schedulePreferences: dto.schedulePreferences } : {}),
      ...(dto.maximumPickupDistanceKm != null
        ? { maximumPickupDistanceKm: dto.maximumPickupDistanceKm }
        : {}),
      ...(dto.autoAcceptEligibleJobs != null ? { autoAcceptEligibleJobs: dto.autoAcceptEligibleJobs } : {}),
    };
    const saved = await this.profiles.save(driver);
    this.events.emit('domain.event', {
      topic: 'drivers',
      eventType: 'driver.preferences.updated',
      aggregateType: 'DriverProfile',
      aggregateId: driver.id,
      eventKey: driver.id,
      payload: { driverId: driver.id, preferences: saved.preferences },
    });
    return {
      serviceCapabilities: saved.serviceCapabilities ?? [],
      preferences: saved.preferences ?? {},
    };
  }

  async learning(userId: string) {
    const driver = await this.drivers.getByUserId(userId);
    const [modules, progress, attempts, certificates] = await Promise.all([
      this.modules.find({ where: { active: true }, order: { sequence: 'ASC' } }),
      this.progress.find({ where: { driverId: driver.id } }),
      this.assessments.find({ where: { driverId: driver.id }, order: { submittedAt: 'DESC' } }),
      this.certificates.find({ where: { driverId: driver.id }, order: { issuedAt: 'DESC' } }),
    ]);
    const items = modules.map((module) => ({
      ...module,
      progress: progress.find((item) => item.moduleId === module.id) ?? null,
      attempts: attempts.filter((item) => item.moduleId === module.id),
      certificate: certificates.find((item) => item.moduleId === module.id) ?? null,
    }));
    const completed = progress.filter((item) =>
      [TrainingProgressStatus.COMPLETED, TrainingProgressStatus.PASSED].includes(item.status),
    ).length;
    return {
      items,
      summary: {
        totalModules: modules.length,
        completedModules: completed,
        completionPercent: modules.length ? Math.round((completed / modules.length) * 100) : 0,
        certificates: certificates.length,
      },
    };
  }

  async start(userId: string, moduleId: string) {
    const { driver } = await this.context(userId, moduleId);
    let record = await this.progress.findOne({ where: { driverId: driver.id, moduleId } });
    record ??= this.progress.create({ driverId: driver.id, moduleId });
    if (record.status === TrainingProgressStatus.NOT_STARTED) {
      record.status = TrainingProgressStatus.IN_PROGRESS;
    }
    return this.progress.save(record);
  }

  async submit(userId: string, moduleId: string, dto: SubmitTrainingAssessmentDto) {
    const { driver, module } = await this.context(userId, moduleId);
    const previousAttempts = await this.assessments.count({ where: { driverId: driver.id, moduleId } });
    const result = this.grade(module.quiz, dto.answers);
    const assessment = await this.assessments.save(
      this.assessments.create({
        driverId: driver.id,
        moduleId,
        attemptNumber: previousAttempts + 1,
        answers: dto.answers,
        score: result.score,
        passed: result.passed,
        submittedAt: new Date(),
        feedback: result.feedback,
      }),
    );
    let record = await this.progress.findOne({ where: { driverId: driver.id, moduleId } });
    record ??= this.progress.create({ driverId: driver.id, moduleId });
    record.answers = dto.answers;
    record.score = result.score;
    record.status = result.passed ? TrainingProgressStatus.PASSED : TrainingProgressStatus.FAILED;
    record.completedAt = new Date();
    await this.progress.save(record);
    const certificate = result.passed ? await this.issueCertificate(driver, module) : null;
    this.events.emit('domain.event', {
      topic: 'training',
      eventType: result.passed ? 'training.assessment.passed' : 'training.assessment.failed',
      aggregateType: 'DriverTrainingAssessment',
      aggregateId: assessment.id,
      eventKey: `${driver.id}:${module.id}`,
      payload: { assessment, certificate },
    });
    return { assessment, progress: record, certificate };
  }

  async listCertificates(userId: string) {
    const driver = await this.drivers.getByUserId(userId);
    return this.certificates.find({ where: { driverId: driver.id }, order: { issuedAt: 'DESC' } });
  }

  async verifyCertificate(code: string) {
    const certificate = await this.certificates.findOne({ where: { verificationCode: code } });
    if (!certificate) throw new NotFoundException('Training certificate not found');
    const driver = await this.profiles.findOne({ where: { id: certificate.driverId } });
    const module = certificate.moduleId
      ? await this.modules.findOne({ where: { id: certificate.moduleId } })
      : null;
    return {
      valid:
        certificate.status === 'ACTIVE' && (!certificate.expiresAt || certificate.expiresAt > new Date()),
      certificate,
      driverId: driver?.id,
      module: module ? { id: module.id, code: module.code, title: module.title } : null,
    };
  }

  private async context(userId: string, moduleId: string) {
    const [driver, module] = await Promise.all([
      this.drivers.getByUserId(userId),
      this.modules.findOne({ where: { id: moduleId, active: true } }),
    ]);
    if (!module) throw new NotFoundException('Training module not found');
    return { driver, module };
  }

  private grade(quiz: Record<string, unknown> | undefined, answers: Record<string, unknown>) {
    if (!quiz) return { score: 100, passed: true, feedback: { graded: false } };
    const questions = Array.isArray(quiz.questions) ? (quiz.questions as Record<string, unknown>[]) : [quiz];
    let correct = 0;
    const results = questions.map((question, index) => {
      const rawKey = question.id ?? question.code ?? index;
      const key = typeof rawKey === 'string' || typeof rawKey === 'number' ? String(rawKey) : String(index);
      const supplied = answers[key] ?? answers[String(index)] ?? (index === 0 ? answers.answer : undefined);
      const expected = question.correctIndex ?? question.correctAnswer ?? question.answer;
      const matches = String(supplied) === String(expected);
      if (matches) correct += 1;
      return { key, correct: matches };
    });
    const score = questions.length ? Math.round((correct / questions.length) * 100) : 100;
    const passMark = Number(quiz.passMark ?? 60);
    return {
      score,
      passed: score >= passMark,
      feedback: { correct, total: questions.length, passMark, results },
    };
  }

  private async issueCertificate(driver: DriverProfile, module: TrainingModule) {
    let certificate = await this.certificates.findOne({
      where: { driverId: driver.id, moduleId: module.id, status: 'ACTIVE' },
    });
    if (certificate) return certificate;
    const shortId = randomUUID().replaceAll('-', '').slice(0, 10).toUpperCase();
    certificate = await this.certificates.save(
      this.certificates.create({
        driverId: driver.id,
        moduleId: module.id,
        certificateNumber: `EVZ-${module.code}-${shortId}`,
        verificationCode: randomUUID(),
        title: `${module.title} Certificate`,
        issuedAt: new Date(),
        status: 'ACTIVE',
        metadata: { moduleCode: module.code },
      }),
    );
    await this.notifications.create({
      userId: driver.userId,
      title: 'Training certificate earned',
      body: `You passed ${module.title}. Your certificate is now available.`,
      data: { certificateId: certificate.id, moduleId: module.id },
    });
    return certificate;
  }
}
