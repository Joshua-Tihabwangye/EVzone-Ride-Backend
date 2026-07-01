import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PARTNER_SCOPES_KEY } from './partner-scope.decorator';
import { PartnerRequest } from './partner.guard';

@Injectable()
export class PartnerScopeGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<string[]>(PARTNER_SCOPES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;
    const request = context.switchToHttp().getRequest<PartnerRequest>();
    const partner = request.partner;
    if (!partner) throw new ForbiddenException('Partner context is missing');
    const scopes = new Set(partner.scopes.map((s) => s.toLowerCase()));
    if (scopes.has('*')) return true;
    const hasScope = required.some((scope) => scopes.has(scope.toLowerCase()));
    if (!hasScope) throw new ForbiddenException('Insufficient partner scope');
    return true;
  }
}
