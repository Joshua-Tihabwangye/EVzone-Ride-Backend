import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AccessTokenVerifierService } from '../../auth/access-token-verifier.service';
import { AuthService } from '../../auth/auth.service';
import { AuthUser } from '../interfaces';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly verifier: AccessTokenVerifierService,
    private readonly authService: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string | string[] | undefined>;
      user?: AuthUser;
    }>();
    const rawHeader = request.headers.authorization;
    const authorization = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader;
    if (!authorization?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Bearer access token is required');
    }

    const token = authorization.slice(7).trim();
    if (!token) throw new UnauthorizedException('Bearer access token is required');
    const claims = await this.verifier.verify(token);
    request.user = await this.authService.validateAccessClaims(claims);
    return true;
  }
}
