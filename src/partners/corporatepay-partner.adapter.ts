import { BadRequestException, Injectable, OnModuleInit } from '@nestjs/common';
import { CorporateIntegrationService } from '../corporate-integration/corporate-integration.service';
import { PartnerAdapter, PartnerContext, PartnerEventPayload } from './partner-adapter.interface';
import { PartnerAdapterRegistry } from './partner-adapter.registry';

@Injectable()
export class CorporatePayPartnerAdapter implements PartnerAdapter, OnModuleInit {
  readonly partnerType = 'CORPORATEPAY';

  constructor(
    private readonly corporate: CorporateIntegrationService,
    private readonly registry: PartnerAdapterRegistry,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  supports(type: string): boolean {
    return type.toUpperCase() === this.partnerType;
  }

  async execute(action: string, payload: unknown, context: PartnerContext): Promise<unknown> {
    const dto = (payload ?? {}) as Record<string, unknown>;
    switch (action) {
      case 'capabilities':
        return this.corporate.capabilities();
      case 'catalog':
        return this.corporate.catalog();
      case 'quote':
        return this.corporate.quote(dto as never);
      case 'createRequest':
        return this.corporate.createRequest(dto as never);
      case 'listRequests':
        return this.corporate.listRequests(dto as never);
      case 'detail':
        return this.corporate.detail(
          String(dto.externalRequestId),
          dto.organizationId as string,
          dto.externalOrganizationId as string,
        );
      case 'authorize':
        return this.corporate.authorize(
          String(dto.externalRequestId),
          dto.authorization as never,
          dto.organizationId as string,
          dto.externalOrganizationId as string,
        );
      case 'provision':
        return this.corporate.provision(
          String(dto.externalRequestId),
          dto.organizationId as string,
          dto.externalOrganizationId as string,
        );
      case 'refreshQuote':
        return this.corporate.refreshQuote(
          String(dto.externalRequestId),
          dto.organizationId as string,
          dto.externalOrganizationId as string,
        );
      case 'cancel':
        return this.corporate.cancel(
          String(dto.externalRequestId),
          dto as never,
          dto.organizationId as string,
          dto.externalOrganizationId as string,
        );
      case 'sync':
        return this.corporate.sync(
          String(dto.externalRequestId),
          dto.organizationId as string,
          dto.externalOrganizationId as string,
        );
      case 'rebook':
        return this.corporate.rebook(
          String(dto.externalRequestId),
          dto as never,
          dto.organizationId as string,
          dto.externalOrganizationId as string,
        );
      case 'refund':
        return this.corporate.refund(
          String(dto.externalRequestId),
          dto as never,
          dto.organizationId as string,
          dto.externalOrganizationId as string,
        );
      case 'addEvidence':
        return this.corporate.addEvidence(
          String(dto.externalRequestId),
          dto as never,
          dto.organizationId as string,
          dto.externalOrganizationId as string,
        );
      case 'listEvidence':
        return this.corporate.listEvidence(
          String(dto.externalRequestId),
          dto.organizationId as string,
          dto.externalOrganizationId as string,
        );
      case 'createDispute':
        return this.corporate.createDispute(
          String(dto.externalRequestId),
          dto as never,
          dto.organizationId as string,
          dto.externalOrganizationId as string,
        );
      case 'listDisputes':
        return this.corporate.listDisputes(
          String(dto.externalRequestId),
          dto.organizationId as string,
          dto.externalOrganizationId as string,
        );
      case 'updateDispute':
        return this.corporate.updateDispute(
          String(dto.externalRequestId),
          String(dto.disputeId),
          dto as never,
          dto.organizationId as string,
          dto.externalOrganizationId as string,
        );
      case 'receipt':
        return this.corporate.receipt(
          String(dto.externalRequestId),
          dto.organizationId as string,
          dto.externalOrganizationId as string,
        );
      case 'sustainability':
        return this.corporate.sustainability(dto as never);
      case 'reconciliationExport':
        return this.corporate.reconciliationExport(dto as never);
      case 'linkSubject':
        return this.corporate.linkSubject(dto as never);
      case 'listEvents':
        return this.corporate.listEvents(dto.after as string, dto.limit as number);
      case 'acknowledgeEvent':
        return this.corporate.acknowledgeEvent(String(dto.id), dto as never);
      default:
        throw new BadRequestException(`Unsupported CorporatePay partner action '${action}'`);
    }
  }

  normalizeEvent(event: unknown): PartnerEventPayload | undefined {
    const e = event as Record<string, unknown> | undefined;
    if (!e || typeof e.eventType !== 'string') return undefined;
    return {
      eventType: e.eventType,
      externalEventId: e.externalEventId as string | undefined,
      payload: (e.payload as Record<string, unknown>) ?? e,
    };
  }
}
