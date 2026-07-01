import { SetMetadata } from '@nestjs/common';

export const PARTNER_SCOPES_KEY = 'partnerScopes';

export const PartnerScope = (...scopes: string[]) => SetMetadata(PARTNER_SCOPES_KEY, scopes);
