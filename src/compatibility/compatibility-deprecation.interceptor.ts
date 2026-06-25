import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import type { Response } from 'express';
import { Observable } from 'rxjs';

@Injectable()
export class CompatibilityDeprecationInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const response = context.switchToHttp().getResponse<Response>();
    const sunsetValue = process.env.LEGACY_API_SUNSET ?? '2027-06-30T23:59:59.000Z';
    const sunset = new Date(sunsetValue);
    response.setHeader('Deprecation', 'true');
    response.setHeader(
      'Sunset',
      Number.isNaN(sunset.getTime()) ? 'Wed, 30 Jun 2027 23:59:59 GMT' : sunset.toUTCString(),
    );
    response.setHeader('Link', '</api/v1/compat/contracts>; rel="successor-version"');
    response.setHeader('Warning', '299 EVzone "Compatibility route; migrate to the canonical contract"');
    return next.handle();
  }
}
