import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Request, Response } from 'express';
import { currentRequestId } from '../request-context';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

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

    if (status >= 500) {
      this.logger.error(exception instanceof Error ? exception.stack : String(exception));
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
