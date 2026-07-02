import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import { currentRequestContext } from '../common/request-context';
import { getActiveTraceId } from '../observability/tracing/trace-context';
import { AppLogger } from './logger.service';

@Module({
  imports: [
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const level = config.get<string>('LOG_LEVEL') ?? 'info';
        const pretty =
          config.get<string>('LOG_PRETTY')?.toLowerCase() === 'true' &&
          config.get<string>('NODE_ENV') !== 'production';

        return {
          pinoHttp: {
            level,
            customProps: (req) => {
              const ctx = currentRequestContext();
              const user = (req as { user?: { userId?: string; id?: string; role?: string } }).user;
              return {
                requestId: ctx?.requestId,
                traceId: getActiveTraceId(),
                startedAt: ctx?.startedAt,
                tenantId: (req.headers as Record<string, string | string[] | undefined>)['x-organization-id'],
                userId: user?.userId ?? user?.id,
                role: user?.role,
                route: (req as { route?: { path?: string } }).route?.path,
              };
            },
            redact: {
              paths: [
                'req.headers.authorization',
                'req.headers.cookie',
                'req.headers["x-api-key"]',
                'req.headers["x-corporatepay-signature"]',
                'res.headers["set-cookie"]',
              ],
              censor: '[Redacted]',
            },
            autoLogging: {
              ignore: (req) => {
                const url = req.url ?? '';
                return (
                  url.startsWith('/api/v1/health') ||
                  url.startsWith('/api/v1/ready') ||
                  url.startsWith('/docs') ||
                  url === '/'
                );
              },
            },
            transport: pretty
              ? {
                  target: 'pino-pretty',
                  options: { colorize: true, singleLine: true },
                }
              : undefined,
          },
        };
      },
    }),
  ],
  providers: [AppLogger],
  exports: [AppLogger],
})
export class LoggingModule {}
