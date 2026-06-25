import 'reflect-metadata';
import { DataSource } from 'typeorm';
import {
  AccountStatus,
  BookingSource,
  BookingStatus,
  CorporatePayAuthorizationStatus,
  CorporatePayDisputeStatus,
  CorporatePayEvidenceType,
  CorporatePayRequestStatus,
  CorporatePayTransactionStatus,
  DispatchPriority,
  EnergyType,
  ManualBookingStatus,
  OrganizationStatus,
  OrganizationType,
  PaymentMethod,
  ServiceType,
  UserRole,
  VehicleStatus,
  VehicleType,
} from '../src/common/enums';
import { CorporateIntegrationService } from '../src/corporate-integration/corporate-integration.service';
import {
  CorporatePayAccount,
  CorporatePayAuthorization,
  CorporatePayFulfillmentDispute,
  CorporatePayFulfillmentEvidence,
  CorporatePayPartnerRequest,
  CorporatePaySubjectLink,
  CorporatePayTransaction,
  DeliveryOrder,
  ENTITIES,
  IntegrationOutbox,
  ManualBooking,
  Organization,
  Payment,
  RentalBooking,
  Ride,
  TouristBooking,
  User,
  Vehicle,
  AmbulanceRequest,
} from '../src/database/entities';
import { DispatchService } from '../src/dispatch/dispatch.service';
import { CorporatePayService } from '../src/corporate-pay/corporate-pay.service';
import { RidesService } from '../src/rides/rides.service';
import { DeliveriesService } from '../src/deliveries/deliveries.service';
import { TouristService } from '../src/tourist/tourist.service';
import { AmbulanceService } from '../src/ambulance/ambulance.service';
import { RentalsService } from '../src/rentals/rentals.service';

describe('CorporatePay partner API v9 contract', () => {
  let db: DataSource;
  let service: CorporateIntegrationService;
  let owner: User;
  let organization: Organization;
  let ride: Ride;
  let booking: ManualBooking;

  beforeAll(async () => {
    db = new DataSource({
      type: 'sqljs',
      entities: [...ENTITIES],
      synchronize: true,
      dropSchema: true,
      logging: false,
    });
    await db.initialize();

    owner = await db.getRepository(User).save(
      db.getRepository(User).create({
        email: 'corporate.owner@evzone.local',
        phone: '+256700987654',
        passwordHash: 'not-used',
        firstName: 'Corporate',
        lastName: 'Owner',
        role: UserRole.CUSTOMER,
        status: AccountStatus.ACTIVE,
      }),
    );
    organization = await db.getRepository(Organization).save(
      db.getRepository(Organization).create({
        name: 'EVzone Corporate Contract Ltd',
        code: 'CP-CONTRACT',
        type: OrganizationType.CORPORATE_CLIENT,
        status: OrganizationStatus.ACTIVE,
        externalId: 'cp-org-contract',
        primaryOwnerUserId: owner.id,
        currency: 'UGX',
      }),
    );
    const vehicle = await db.getRepository(Vehicle).save(
      db.getRepository(Vehicle).create({
        ownerUserId: owner.id,
        make: 'BYD',
        model: 'Atto 3',
        year: 2026,
        plateNumber: 'UCP 009E',
        vehicleType: VehicleType.SUV,
        energyType: EnergyType.ELECTRIC,
        status: VehicleStatus.ACTIVE,
        seats: 5,
        isActive: true,
        serviceCapabilities: [ServiceType.RIDE],
      }),
    );

    const dispatchMock = {
      createManualBooking: jest.fn(async (_actor, organizationId, dto) => {
        ride = await db.getRepository(Ride).save(
          db.getRepository(Ride).create({
            riderId: owner.id,
            vehicleId: vehicle.id,
            status: BookingStatus.REQUESTED,
            estimatedDistanceKm: 12,
            estimatedDurationMinutes: 25,
            estimatedFare: 50_000,
            currency: 'UGX',
            paymentMethod: PaymentMethod.CORPORATE_PAY,
            verificationCodeHash: 'test-verification-hash',
            verificationCode: '1234',
          }),
        );
        const account = await db.getRepository(CorporatePayAccount).findOneByOrFail({
          id: dto.corporatePayAccountId,
        });
        const transaction = await db.getRepository(CorporatePayTransaction).save(
          db.getRepository(CorporatePayTransaction).create({
            reference: `CP-TEST-${Date.now()}`,
            idempotencyKey: `CP-TEST-${dto.corporatePayExternalRequestId}`,
            accountId: account.id,
            organizationId,
            userId: owner.id,
            serviceType: ServiceType.RIDE,
            serviceId: ride.id,
            amount: 50_000,
            currency: 'UGX',
            status: CorporatePayTransactionStatus.AUTHORIZED,
            providerPayload: {
              externalRequestId: dto.corporatePayExternalRequestId,
              externalAuthorizationId: dto.corporatePayExternalAuthorizationId,
            },
          }),
        );
        booking = await db.getRepository(ManualBooking).save(
          db.getRepository(ManualBooking).create({
            reference: `MB-CP-${Date.now()}`,
            organizationId,
            agentUserId: owner.id,
            source: BookingSource.CORPORATE_PAY,
            serviceType: ServiceType.RIDE,
            status: ManualBookingStatus.DISPATCH_PENDING,
            priority: DispatchPriority.NORMAL,
            customerUserId: owner.id,
            customer: dto.customer,
            bookingPayload: dto.payload,
            serviceId: ride.id,
            quotedAmount: 50_000,
            currency: 'UGX',
            paymentMethod: PaymentMethod.CORPORATE_PAY,
            corporatePayTransactionId: transaction.id,
          }),
        );
        transaction.manualBookingId = booking.id;
        await db.getRepository(CorporatePayTransaction).save(transaction);
        return { booking, transaction };
      }),
      syncStatus: jest.fn(async () => ({ booking, service: ride })),
      cancel: jest.fn(async () => {
        booking.status = ManualBookingStatus.CANCELLED;
        booking.cancelledAt = new Date();
        await db.getRepository(ManualBooking).save(booking);
        return booking;
      }),
    } as unknown as DispatchService;

    const corporatePayMock = {
      refund: jest.fn(async (_actor, transactionId, refund) => {
        const transaction = await db.getRepository(CorporatePayTransaction).findOneByOrFail({
          id: transactionId,
        });
        transaction.status = CorporatePayTransactionStatus.REFUNDED;
        transaction.refundedAt = new Date();
        transaction.providerPayload = { ...(transaction.providerPayload ?? {}), refund };
        return db.getRepository(CorporatePayTransaction).save(transaction);
      }),
    } as unknown as CorporatePayService;

    const ridesMock = {
      estimate: jest.fn(async () => ({
        total: 50_000,
        currency: 'UGX',
        breakdown: { baseFare: 10_000, distanceFare: 40_000 },
      })),
    } as unknown as RidesService;

    service = new CorporateIntegrationService(
      db.getRepository(CorporatePayPartnerRequest),
      db.getRepository(CorporatePayAuthorization),
      db.getRepository(CorporatePayFulfillmentEvidence),
      db.getRepository(CorporatePayFulfillmentDispute),
      db.getRepository(CorporatePaySubjectLink),
      db.getRepository(CorporatePayAccount),
      db.getRepository(CorporatePayTransaction),
      db.getRepository(ManualBooking),
      db.getRepository(Payment),
      db.getRepository(Organization),
      db.getRepository(User),
      db.getRepository(Ride),
      db.getRepository(DeliveryOrder),
      db.getRepository(TouristBooking),
      db.getRepository(AmbulanceRequest),
      db.getRepository(RentalBooking),
      db.getRepository(Vehicle),
      db.getRepository(IntegrationOutbox),
      dispatchMock,
      corporatePayMock,
      ridesMock,
      {} as DeliveriesService,
      {} as TouristService,
      {} as AmbulanceService,
      {} as RentalsService,
    );
  }, 60_000);

  afterAll(async () => {
    if (db.isInitialized) await db.destroy();
  });

  it('links CorporatePay subjects to existing EVzone identities', async () => {
    const link = await service.linkSubject({
      externalOrganizationId: 'cp-org-contract',
      externalMemberId: 'member-1001',
      organizationId: organization.id,
      userId: owner.id,
      accountId: 'cp-account-contract',
    });
    expect(link.organizationId).toBe(organization.id);
    expect(link.userId).toBe(owner.id);
    expect(link.accountId).toBeDefined();
  });

  it('quotes, stores, authorizes and provisions a corporate ride idempotently', async () => {
    const requestDto = {
      externalRequestId: 'cp-request-ride-1001',
      externalOrderId: 'cp-order-1001',
      externalOrganizationId: 'cp-org-contract',
      externalMemberId: 'member-1001',
      accountId: 'cp-account-contract',
      serviceType: ServiceType.RIDE,
      customer: { userId: owner.id, email: owner.email },
      servicePayload: {
        pickup: { address: 'Kampala Road', latitude: 0.3136, longitude: 32.5811 },
        destination: { address: 'Entebbe Airport', latitude: 0.0424, longitude: 32.4435 },
      },
      corporateContext: { purpose: 'Airport transfer', projectTag: 'PROJECT-1001' },
      costCenterId: 'CC-KLA',
      budgetId: 'BUDGET-TRAVEL',
    };
    const created = await service.createRequest(requestDto);
    expect(created.request.status).toBe(CorporatePayRequestStatus.PENDING_APPROVAL);
    expect(created.request.amount).toBe(50_000);

    const duplicate = await service.createRequest(requestDto);
    expect(duplicate.request.id).toBe(created.request.id);

    const provisioned = await service.authorize('cp-request-ride-1001', {
      externalAuthorizationId: 'auth-ride-1001',
      status: CorporatePayAuthorizationStatus.AUTHORIZED,
      approvedAmount: 50_000,
      currency: 'UGX',
      approvalId: 'approval-1001',
      policyId: 'policy-travel',
      budgetId: 'BUDGET-TRAVEL',
      budgetReservationId: 'reserve-1001',
    });
    expect(provisioned.request.status).toBe(CorporatePayRequestStatus.CONFIRMED);
    expect(provisioned.request.serviceId).toBe(ride.id);
    expect(provisioned.request.manualBookingId).toBe(booking.id);
    expect(provisioned.request.transactionId).toBeDefined();
  });

  it('syncs completion, generates evidence, receipts and ESG metrics', async () => {
    booking.status = ManualBookingStatus.COMPLETED;
    booking.completedAt = new Date();
    await db.getRepository(ManualBooking).save(booking);
    ride.status = BookingStatus.COMPLETED;
    ride.finalFare = 48_000;
    await db.getRepository(Ride).save(ride);

    const synced = await service.sync('cp-request-ride-1001', undefined, 'cp-org-contract');
    expect(synced.request.status).toBe(CorporatePayRequestStatus.COMPLETED);
    expect(synced.evidence.map((item) => item.type)).toEqual(
      expect.arrayContaining([
        CorporatePayEvidenceType.COMPLETION_LOG,
        CorporatePayEvidenceType.TRIP_RECEIPT,
      ]),
    );

    const receipt = await service.receipt('cp-request-ride-1001', undefined, 'cp-org-contract');
    expect(receipt.amount).toBe(48_000);
    expect(receipt.allocation.costCenterId).toBe('CC-KLA');

    const esg = await service.sustainability({ externalOrganizationId: 'cp-org-contract' });
    expect(esg.tripCount).toBe(1);
    expect(esg.totalDistanceKm).toBe(12);
    expect(esg.estimatedAvoidedKg).toBeGreaterThan(0);
  });

  it('supports fulfillment evidence, disputes and reconciliation exports', async () => {
    const evidence = await service.addEvidence(
      'cp-request-ride-1001',
      {
        externalEvidenceId: 'proof-1001',
        type: CorporatePayEvidenceType.PHOTO,
        url: 'https://files.example.test/proof-1001.jpg',
        actor: 'driver',
      },
      undefined,
      'cp-org-contract',
    );
    expect(evidence.externalEvidenceId).toBe('proof-1001');

    const dispute = await service.createDispute(
      'cp-request-ride-1001',
      {
        externalDisputeId: 'dispute-1001',
        reason: 'Fare requires review',
        amount: 2_000,
      },
      undefined,
      'cp-org-contract',
    );
    expect(dispute.status).toBe(CorporatePayDisputeStatus.OPEN);

    const resolved = await service.updateDispute(
      'cp-request-ride-1001',
      dispute.id,
      { status: CorporatePayDisputeStatus.RESOLVED, resolution: 'Fare validated' },
      undefined,
      'cp-org-contract',
    );
    expect(resolved.status).toBe(CorporatePayDisputeStatus.RESOLVED);

    const exportResult = await service.reconciliationExport({
      externalOrganizationId: 'cp-org-contract',
    });
    expect(exportResult.rowCount).toBe(1);
    expect(exportResult.rows[0]).toEqual(
      expect.objectContaining({ externalRequestId: 'cp-request-ride-1001', costCenterId: 'CC-KLA' }),
    );
  });

  it('exposes durable outbound integration events with acknowledgements', async () => {
    const events = await service.listEvents(undefined, 100);
    expect(events.items.length).toBeGreaterThan(3);
    const acknowledged = await service.acknowledgeEvent(events.items[0].id, {
      externalReceiptId: 'cp-event-receipt-1',
    });
    expect(acknowledged.status).toBe('PROCESSED');
  });
});
