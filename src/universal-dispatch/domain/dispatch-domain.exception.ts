import { HttpException, HttpStatus } from '@nestjs/common';

export class DispatchDomainException extends HttpException {
  constructor(
    code: string,
    message: string,
    status: HttpStatus = HttpStatus.CONFLICT,
    details?: Record<string, unknown>,
  ) {
    super({ code, message, details }, status);
  }
}
