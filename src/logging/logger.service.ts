import { Injectable, LoggerService } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';

@Injectable()
export class AppLogger implements LoggerService {
  constructor(private readonly logger: PinoLogger) {}

  log(message: string, ...optionalParams: unknown[]): void {
    this.logger.info(this.contextFrom(optionalParams), message);
  }

  error(message: string, ...optionalParams: unknown[]): void {
    this.logger.error(this.contextFrom(optionalParams), message);
  }

  warn(message: string, ...optionalParams: unknown[]): void {
    this.logger.warn(this.contextFrom(optionalParams), message);
  }

  debug(message: string, ...optionalParams: unknown[]): void {
    this.logger.debug(this.contextFrom(optionalParams), message);
  }

  verbose(message: string, ...optionalParams: unknown[]): void {
    this.logger.trace(this.contextFrom(optionalParams), message);
  }

  private contextFrom(params: unknown[]): Record<string, unknown> {
    return typeof params[0] === 'object' && params[0] !== null ? (params[0] as Record<string, unknown>) : {};
  }
}
