import { BadRequestException, CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { REQUIRE_IDEMPOTENCY_KEY } from './require-idempotency.decorator';

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

@Injectable()
export class IdempotencyGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    if (context.getType() !== 'http') return true;

    const handler = context.getHandler();
    const controller = context.getClass();
    const required = this.reflector.getAllAndOverride<boolean>(REQUIRE_IDEMPOTENCY_KEY, [
      handler,
      controller,
    ]);
    if (!required) return true;

    const request = context.switchToHttp().getRequest<Request>();
    if (!MUTATING_METHODS.has(request.method)) return true;

    const header = request.headers['idempotency-key'];
    const raw = Array.isArray(header) ? header[0] : header;
    if (typeof raw !== 'string' || !raw.trim()) {
      throw new BadRequestException({
        code: 'IDEMPOTENCY_KEY_REQUIRED',
        message: 'Idempotency-Key header is required for this operation',
      });
    }

    const key = raw.trim();
    if (key.length < 8) {
      throw new BadRequestException({
        code: 'IDEMPOTENCY_KEY_INVALID',
        message: 'Idempotency-Key must be at least 8 characters',
      });
    }

    // Expose the normalized key for downstream interceptors / controllers.
    (request as Request & { idempotencyKey?: string }).idempotencyKey = key;
    return true;
  }
}
