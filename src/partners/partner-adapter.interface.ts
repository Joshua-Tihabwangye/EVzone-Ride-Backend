export interface PartnerContext {
  partnerId: string;
  partnerType: string;
  scopes: string[];
  organizationId?: string;
}

export interface PartnerEventPayload {
  eventType: string;
  externalEventId?: string;
  payload: Record<string, unknown>;
}

export interface PartnerAdapter {
  readonly partnerType: string;
  supports(type: string): boolean;
  execute(action: string, payload: unknown, context: PartnerContext): Promise<unknown>;
  normalizeEvent?(event: unknown): PartnerEventPayload | undefined;
}
