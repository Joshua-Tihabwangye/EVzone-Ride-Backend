import { ExecutionContext, INestApplication } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { DatabaseModule } from '../src/database/database.module';
import { InfrastructureModule } from '../src/infrastructure/infrastructure.module';
import { OperationsModule } from '../src/operations/operations.module';
import { OperationsControlCenterService } from '../src/operations/operations-control-center.service';
import { OperationsControlCenterController } from '../src/operations/operations-control-center.controller';
import { RolesGuard } from '../src/common/guards/roles.guard';
import { UserRole } from '../src/common/enums';
import { ENTITIES, OperationalAlert, User } from '../src/database/entities';

describe('Operations control center', () => {
  let app: INestApplication;
  let service: OperationsControlCenterService;
  let dataSource: DataSource;
  let alerts: Repository<OperationalAlert>;
  let users: Repository<User>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        TypeOrmModule.forRoot({
          type: 'sqljs',
          location: ':memory:',
          synchronize: true,
          entities: [...ENTITIES],
          logging: false,
        }),
        DatabaseModule,
        InfrastructureModule,
        OperationsModule,
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    service = app.get(OperationsControlCenterService);
    dataSource = app.get(DataSource);
    alerts = dataSource.getRepository(OperationalAlert);
    users = dataSource.getRepository(User);
  });

  afterAll(async () => {
    await app?.close();
  });

  beforeEach(async () => {
    await dataSource.query('DELETE FROM operational_alerts');
    await dataSource.query('DELETE FROM users');
  });

  async function seedUser(id: string, role: UserRole): Promise<User> {
    return users.save(
      users.create({
        id,
        email: `${id}@example.com`,
        firstName: 'Test',
        lastName: 'User',
        role,
        status: 'ACTIVE' as never,
        passwordHash: 'hash',
      }),
    );
  }

  async function seedAlert(severity: string, status: string): Promise<OperationalAlert> {
    return alerts.save(
      alerts.create({
        type: 'TEST_ALERT',
        severity,
        status,
        title: 'Test alert',
        message: 'Test alert for control center',
      }),
    );
  }

  it('returns an aggregated dashboard', async () => {
    await seedAlert('HIGH', 'OPEN');
    const dashboard = await service.getDashboard();

    expect(dashboard.health).toBeDefined();
    expect(['ok', 'degraded', 'down']).toContain(dashboard.health.status);
    expect(dashboard.health.dependencies).toHaveProperty('database');
    expect(dashboard.workers).toBeDefined();
    expect(dashboard.watchdog).toBeDefined();
    expect(dashboard.alerts.total).toBe(1);
    expect(dashboard.alerts.bySeverity.HIGH).toBe(1);
    expect(dashboard.alerts.byStatus.OPEN).toBe(1);
    expect(dashboard.outbox).toMatchObject({ pending: 0, failed: 0, total: 0 });
    expect(dashboard.failedWebhooks).toBe(0);
    expect(dashboard.slos.length).toBeGreaterThan(0);
  });

  it('returns a health summary', async () => {
    const health = await service.getHealthSummary();
    expect(health.status).toBeDefined();
    expect(Object.keys(health.dependencies)).toEqual(['database', 'migrations', 'redis', 'kafka', 'storage']);
  });

  it('returns an alert summary', async () => {
    await seedAlert('WARNING', 'OPEN');
    await seedAlert('WARNING', 'ACKNOWLEDGED');
    const summary = await service.getAlertsSummary();
    expect(summary.total).toBe(2);
    expect(summary.bySeverity.WARNING).toBe(2);
    expect(summary.byStatus.OPEN).toBe(1);
    expect(summary.byStatus.ACKNOWLEDGED).toBe(1);
  });

  it('returns a worker heartbeat summary', async () => {
    const workers = await service.getWorkersSummary();
    expect(Object.keys(workers).length).toBeGreaterThan(0);
  });

  it('rejects non-authorized roles', () => {
    const reflector = new Reflector();
    const guard = new RolesGuard(reflector);
    const handler = OperationsControlCenterController.prototype.dashboard;

    const context = {
      getHandler: () => handler,
      getClass: () => OperationsControlCenterController,
      switchToHttp: () => ({
        getRequest: () => ({ user: { role: UserRole.CUSTOMER } }),
      }),
    } as unknown as ExecutionContext;

    expect(guard.canActivate(context)).toBe(false);
  });

  it('allows authorized roles', async () => {
    const admin = await seedUser('admin-occ-1', UserRole.ADMIN);
    const reflector = new Reflector();
    const guard = new RolesGuard(reflector);
    const handler = OperationsControlCenterController.prototype.dashboard;

    const context = {
      getHandler: () => handler,
      getClass: () => OperationsControlCenterController,
      switchToHttp: () => ({
        getRequest: () => ({ user: { role: admin.role } }),
      }),
    } as unknown as ExecutionContext;

    expect(guard.canActivate(context)).toBe(true);
  });
});
