import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';
import { PartnerAuthService } from '../partner-auth.service';
import { PartnerContext } from '../partner-adapter.interface';

export interface PartnerRequest extends Request {
  partner?: PartnerContext;
}

@Injectable()
export class PartnerGuard implements CanActivate {
  constructor(private readonly partnerAuth: PartnerAuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<PartnerRequest>();
    const headerKey = request.headers['x-partner-api-key'];
    const key = Array.isArray(headerKey) ? headerKey[0] : headerKey;
    if (!key) throw new UnauthorizedException('Missing x-partner-api-key header');
    request.partner = await this.partnerAuth.validateKey(key);
    return true;
  }
}
