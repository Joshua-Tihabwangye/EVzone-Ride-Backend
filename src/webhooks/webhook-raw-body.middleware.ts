import { Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import * as bodyParser from 'body-parser';

declare module 'express' {
  interface Request {
    rawBody?: string;
  }
}

@Injectable()
export class WebhookRawBodyMiddleware implements NestMiddleware {
  private readonly parser = bodyParser.raw({ type: 'application/json' });

  use(req: Request, res: Response, next: NextFunction): void {
    this.parser(req, res, () => {
      const buffer = req.body as unknown;
      if (Buffer.isBuffer(buffer)) {
        req.rawBody = buffer.toString('utf8');
        try {
          req.body = JSON.parse(req.rawBody) as Record<string, unknown>;
        } catch {
          req.body = {};
        }
      }
      next();
    });
  }
}
