import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { Request, Response } from 'express';
import { PinoLogger } from 'nestjs-pino';
import { currentRequestId } from '../request-context';

@Catch()
@Injectable()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(private readonly logger: PinoLogger) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const response = context.getResponse<Response>();
    const request = context.getRequest<Request>();
    const status =
      exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const raw = exception instanceof HttpException ? exception.getResponse() : undefined;
    const message =
      typeof raw === 'string'
        ? raw
        : typeof raw === 'object' && raw && 'message' in raw
          ? (raw as { message: string | string[] }).message
          : exception instanceof Error
            ? exception.message
            : 'Internal server error';

    const user = (request as { user?: { userId?: string; id?: string; role?: string } }).user;
    const logPayload = {
      status,
      method: request.method,
      path: request.originalUrl,
      requestId: currentRequestId(),
      userId: user?.userId ?? user?.id,
      role: user?.role,
      tenantId: request.headers['x-organization-id'],
      classification: status >= 500 ? 'UNEXPECTED_ERROR' : 'CLIENT_ERROR',
      operational: exception instanceof HttpException,
      err:
        exception instanceof Error
          ? { name: exception.name, message: exception.message, stack: exception.stack }
          : exception,
    };

    if (status >= 500) {
      this.logger.error(logPayload, 'Request failed with unexpected error');
    } else {
      this.logger.warn(logPayload, 'Request failed with client error');
    }

    response.status(status).json({
      success: false,
      error: {
        statusCode: status,
        message,
        path: request.originalUrl,
        method: request.method,
        requestId: currentRequestId(),
        timestamp: new Date().toISOString(),
      },
    });
  }
}
