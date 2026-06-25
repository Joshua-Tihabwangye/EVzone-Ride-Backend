import { Logger } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import Redis from 'ioredis';
import type { Server, ServerOptions } from 'socket.io';

export class RedisIoAdapter extends IoAdapter {
  private readonly logger = new Logger(RedisIoAdapter.name);
  private adapterConstructor?: ReturnType<typeof createAdapter>;
  private publisher?: Redis;
  private subscriber?: Redis;

  async connect(): Promise<boolean> {
    const redisUrl = process.env.REDIS_URL?.trim();
    const enabled = (process.env.REDIS_SOCKET_ADAPTER_ENABLED ?? Boolean(redisUrl).toString()) === 'true';
    if (!enabled || !redisUrl) return false;

    this.publisher = new Redis(redisUrl, {
      lazyConnect: true,
      maxRetriesPerRequest: 2,
      connectTimeout: Number(process.env.REDIS_CONNECT_TIMEOUT_MS ?? 3000),
    });
    this.subscriber = this.publisher.duplicate();
    try {
      await Promise.all([this.publisher.connect(), this.subscriber.connect()]);
      this.adapterConstructor = createAdapter(this.publisher, this.subscriber, {
        requestsTimeout: Number(process.env.REDIS_SOCKET_REQUEST_TIMEOUT_MS ?? 5000),
      });
      this.logger.log('Redis Socket.IO adapter connected');
      return true;
    } catch (error) {
      this.logger.warn(
        `Redis Socket.IO adapter unavailable; using in-process sockets: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      this.publisher.disconnect();
      this.subscriber.disconnect();
      this.publisher = undefined;
      this.subscriber = undefined;
      return false;
    }
  }

  createIOServer(port: number, options?: ServerOptions): Server {
    const server = super.createIOServer(port, options) as Server;
    if (this.adapterConstructor) server.adapter(this.adapterConstructor);
    return server;
  }
}
