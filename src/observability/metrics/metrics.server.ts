import { Injectable, Logger, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createServer, Server, IncomingMessage, ServerResponse } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { MetricsService } from './metrics.service';

@Injectable()
export class MetricsServerService implements OnApplicationShutdown {
  private readonly logger = new Logger(MetricsServerService.name);
  private server?: Server;

  constructor(
    private readonly config: ConfigService,
    private readonly metrics: MetricsService,
  ) {}

  async onModuleInit(): Promise<void> {
    const enabled = ['true', '1', 'yes', 'on'].includes(
      (this.config.get<string>('METRICS_ENABLED') ?? 'false').toLowerCase(),
    );
    if (!enabled) return;

    const port = Number(this.config.get<string>('METRICS_PORT') ?? 9090);
    const endpoint = this.config.get<string>('METRICS_ENDPOINT') ?? '/metrics';
    const username = this.config.get<string>('METRICS_BASIC_AUTH_USER');
    const password = this.config.get<string>('METRICS_BASIC_AUTH_PASS');

    this.server = createServer((req, res) => {
      void this.handle(req, res, endpoint, username, password);
    });

    this.server.listen(port, () => {
      this.logger.log(`Prometheus metrics available at http://localhost:${port}${endpoint}`);
    });
  }

  onApplicationShutdown(): Promise<void> {
    return new Promise((resolve) => {
      this.server?.close(() => resolve());
      if (!this.server) resolve();
    });
  }

  private async handle(
    req: IncomingMessage,
    res: ServerResponse,
    endpoint: string,
    username: string | undefined,
    password: string | undefined,
  ): Promise<void> {
    if (req.url !== endpoint) {
      res.writeHead(404).end('Not found');
      return;
    }

    if (username && password && !this.authenticate(req.headers.authorization, username, password)) {
      res.writeHead(401, { 'WWW-Authenticate': 'Basic realm="metrics"' }).end('Unauthorized');
      return;
    }

    try {
      const metrics = await this.metrics.metrics();
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' }).end(metrics);
    } catch (error) {
      this.logger.error(error);
      res.writeHead(500).end('Failed to collect metrics');
    }
  }

  private authenticate(header: string | undefined, username: string, password: string): boolean {
    if (!header?.startsWith('Basic ')) return false;
    const credentials = Buffer.from(header.slice(6), 'base64').toString('utf8');
    const [providedUser, providedPass] = credentials.split(':');
    const userMatch =
      providedUser?.length === username.length &&
      timingSafeEqual(Buffer.from(providedUser), Buffer.from(username));
    const passMatch =
      providedPass?.length === password.length &&
      timingSafeEqual(Buffer.from(providedPass), Buffer.from(password));
    return userMatch && passMatch;
  }
}
