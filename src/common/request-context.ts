import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

export interface RequestContextState {
  requestId: string;
  startedAt: number;
}

export type RequestWithContext = Request & { requestId?: string };

const requestContextStorage = new AsyncLocalStorage<RequestContextState>();

export function requestContextMiddleware(
  request: RequestWithContext,
  response: Response,
  next: NextFunction,
): void {
  const supplied = request.headers['x-request-id'];
  const requestId =
    typeof supplied === 'string' && supplied.trim().length > 0 ? supplied.trim().slice(0, 128) : randomUUID();

  request.requestId = requestId;
  response.setHeader('x-request-id', requestId);
  requestContextStorage.run({ requestId, startedAt: Date.now() }, next);
}

export function currentRequestContext(): RequestContextState | undefined {
  return requestContextStorage.getStore();
}

export function currentRequestId(): string | undefined {
  return currentRequestContext()?.requestId;
}
