import { DataSource, Repository } from 'typeorm';
import { ENTITIES } from '../src/database/entities';
import { FinancialOperationsService } from '../src/financial-operations/financial-operations.service';
import { PermissionsService } from '../src/permissions/permissions.service';
import {
  CashoutRequest,
  DriverProfile,
  Organization,
  OrganizationMember,
  StoredPaymentMethod,
  User,
} from '../src/database/entities';
import {
  CashoutRequestStatus,
  MembershipStatus,
  OrganizationMemberRole,
  OrganizationStatus,
  OrganizationType,
  UserRole,
} from '../src/common/enums';

describe('Tenant isolation', () => {
  let db: DataSource;
  let cashouts: Repository<CashoutRequest>;
  let organizations: Repository<Organization>;
  let members: Repository<OrganizationMember>;
  let users: Repository<User>;
  let financialOperations: FinancialOperationsService;
  let permissionsService: PermissionsService;

  beforeAll(async () => {
    db = new DataSource({
      type: 'sqljs',
      location: ':memory:',
      synchronize: true,
      entities: [...ENTITIES],
      logging: false,
    });
    await db.initialize();
    cashouts = db.getRepository(CashoutRequest);
    organizations = db.getRepository(Organization);
    members = db.getRepository(OrganizationMember);
    users = db.getRepository(User);
    permissionsService = new PermissionsService(organizations, members);
    financialOperations = new FinancialOperationsService(
      db,
      db.getRepository(StoredPaymentMethod),
      cashouts,
      db.getRepository(DriverProfile),
      {} as any,
      {} as any,
    );
  });

  afterAll(async () => {
    await db?.destroy();
  });

  async function seedUser(id: string) {
    const existing = await users.findOne({ where: { id } });
    if (existing) return existing;
    return users.save(
      users.create({
        id,
        email: `${id}@example.com`,
        firstName: 'Test',
        lastName: 'User',
        role: UserRole.CUSTOMER,
        status: 'ACTIVE' as never,
        passwordHash: 'hash',
      }),
    );
  }

  async function seedOrganization(code: string, owner: User) {
    const organization = await organizations.save(
      organizations.create({
        name: `Org ${code}`,
        type: OrganizationType.FLEET_PARTNER,
        status: OrganizationStatus.ACTIVE,
        code,
        primaryOwnerUserId: owner.id,
      }),
    );
    await members.save(
      members.create({
        organizationId: organization.id,
        userId: owner.id,
        role: OrganizationMemberRole.OWNER,
        status: MembershipStatus.ACTIVE,
      }),
    );
    return organization;
  }

  async function addMember(organizationId: string, userId: string, role: OrganizationMemberRole) {
    return members.save(
      members.create({
        organizationId,
        userId,
        role,
        status: MembershipStatus.ACTIVE,
      }),
    );
  }

  it('listCashouts scopes results to the active organization for non-admin users', async () => {
    const owner1 = await seedUser('iso_owner_1');
    const owner2 = await seedUser('iso_owner_2');
    const viewer = await seedUser('iso_viewer_1');
    const org1 = await seedOrganization('ISO-ORG-1', owner1);
    const org2 = await seedOrganization('ISO-ORG-2', owner2);
    await addMember(org1.id, viewer.id, OrganizationMemberRole.FINANCE);

    await cashouts.save(
      cashouts.create({
        userId: owner1.id,
        organizationId: org1.id,
        reference: 'CO-ISO-1',
        amount: 100,
        currency: 'UGX',
        status: CashoutRequestStatus.PENDING,
        method: { phone: '123' },
      }),
    );
    await cashouts.save(
      cashouts.create({
        userId: owner2.id,
        organizationId: org2.id,
        reference: 'CO-ISO-2',
        amount: 200,
        currency: 'UGX',
        status: CashoutRequestStatus.PENDING,
        method: { phone: '456' },
      }),
    );

    const ctx = await permissionsService.resolveContext(
      { id: viewer.id, role: UserRole.CUSTOMER, firstName: viewer.firstName, lastName: viewer.lastName },
      org1.id,
    );

    const results = await financialOperations.listCashouts(undefined, ctx.activeOrganizationId);
    expect(results).toHaveLength(1);
    expect(results[0].reference).toBe('CO-ISO-1');
    expect(results[0].organizationId).toBe(org1.id);
  });

  it('listCashouts returns records from all organizations for platform admins', async () => {
    await seedUser('iso_admin_1');
    const results = await financialOperations.listCashouts();
    expect(results.length).toBeGreaterThanOrEqual(2);
  });
});
