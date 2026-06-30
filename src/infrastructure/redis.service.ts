import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

interface MemoryValue {
  value: string;
  expiresAt?: number;
}

interface GeoPointRecord {
  longitude: number;
  latitude: number;
  expiresAt?: number;
}

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client?: Redis;
  private connected = false;
  private readonly memory = new Map<string, MemoryValue>();
  private readonly geo = new Map<string, Map<string, GeoPointRecord>>();

  constructor(private readonly config: ConfigService) {}

  async onModuleInit(): Promise<void> {
    const url = this.config.get<string>('REDIS_URL')?.trim();
    const explicitlyDisabled = this.config.get<string>('REDIS_DISABLED')?.toLowerCase() === 'true';
    if (!url || explicitlyDisabled) {
      this.logger.log('Redis is not configured; using resilient in-memory cache fallbacks');
      return;
    }
    const client = new Redis(url, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      connectTimeout: Number(this.config.get<string>('REDIS_CONNECT_TIMEOUT_MS') ?? 3000),
    });
    client.on('error', (error) => this.logger.warn(`Redis error: ${error.message}`));
    try {
      await client.connect();
      this.client = client;
      this.connected = true;
      this.logger.log('Redis cache/session/geo connection established');
    } catch (error) {
      client.disconnect();
      this.logger.warn(
        `Redis unavailable; continuing with in-memory fallbacks: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  onModuleDestroy(): void {
    this.client?.disconnect();
    this.connected = false;
  }

  status() {
    return {
      configured: Boolean(this.config.get<string>('REDIS_URL')),
      connected: this.connected,
      fallback: this.connected ? null : 'IN_MEMORY',
      productionReady:
        this.config.get<string>('NODE_ENV') !== 'production' ||
        (Boolean(this.config.get<string>('REDIS_URL')) && this.connected),
      memoryKeys: this.memory.size,
      geoIndexes: this.geo.size,
    };
  }

  isConnected(): boolean {
    return this.connected;
  }

  async get(key: string): Promise<string | null> {
    if (this.client && this.connected) {
      try {
        return await this.client.get(key);
      } catch (error) {
        this.logger.warn(`Redis GET failed for ${key}: ${this.message(error)}`);
      }
    }
    const record = this.memory.get(key);
    if (!record) return null;
    if (record.expiresAt && record.expiresAt <= Date.now()) {
      this.memory.delete(key);
      return null;
    }
    return record.value;
  }

  async getJson<T>(key: string): Promise<T | null> {
    const value = await this.get(key);
    if (!value) return null;
    try {
      return JSON.parse(value) as T;
    } catch {
      return null;
    }
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (this.client && this.connected) {
      try {
        if (ttlSeconds && ttlSeconds > 0) await this.client.set(key, value, 'EX', ttlSeconds);
        else await this.client.set(key, value);
        return;
      } catch (error) {
        this.logger.warn(`Redis SET failed for ${key}: ${this.message(error)}`);
      }
    }
    this.memory.set(key, {
      value,
      expiresAt: ttlSeconds && ttlSeconds > 0 ? Date.now() + ttlSeconds * 1000 : undefined,
    });
  }

  setJson(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
    return this.set(key, JSON.stringify(value), ttlSeconds);
  }

  async setIfAbsent(key: string, value: string, ttlSeconds?: number): Promise<boolean> {
    if (this.client && this.connected) {
      try {
        const result = ttlSeconds
          ? await this.client.set(key, value, 'EX', ttlSeconds, 'NX')
          : await this.client.set(key, value, 'NX');
        return result === 'OK';
      } catch (error) {
        this.logger.warn(`Redis SET NX failed for ${key}: ${this.message(error)}`);
      }
    }
    if ((await this.get(key)) !== null) return false;
    await this.set(key, value, ttlSeconds);
    return true;
  }

  async delete(key: string): Promise<void> {
    if (this.client && this.connected) {
      try {
        await this.client.del(key);
      } catch (error) {
        this.logger.warn(`Redis DEL failed for ${key}: ${this.message(error)}`);
      }
    }
    this.memory.delete(key);
  }

  async geoAdd(
    key: string,
    member: string,
    longitude: number,
    latitude: number,
    ttlSeconds?: number,
  ): Promise<void> {
    if (this.client && this.connected) {
      try {
        await this.client.geoadd(key, longitude, latitude, member);
        if (ttlSeconds && ttlSeconds > 0) await this.client.expire(key, ttlSeconds);
        return;
      } catch (error) {
        this.logger.warn(`Redis GEOADD failed for ${member}: ${this.message(error)}`);
      }
    }
    const index = this.geo.get(key) ?? new Map<string, GeoPointRecord>();
    index.set(member, {
      longitude,
      latitude,
      expiresAt: ttlSeconds && ttlSeconds > 0 ? Date.now() + ttlSeconds * 1000 : undefined,
    });
    this.geo.set(key, index);
  }

  async geoRemove(key: string, member: string): Promise<void> {
    if (this.client && this.connected) {
      try {
        await this.client.zrem(key, member);
      } catch (error) {
        this.logger.warn(`Redis GEO remove failed for ${member}: ${this.message(error)}`);
      }
    }
    this.geo.get(key)?.delete(member);
  }

  async geoSearch(
    key: string,
    longitude: number,
    latitude: number,
    radiusKm: number,
    count = 100,
  ): Promise<Array<{ member: string; distanceKm: number }>> {
    if (this.client && this.connected) {
      try {
        const raw = (await this.client.call(
          'GEOSEARCH',
          key,
          'FROMLONLAT',
          longitude,
          latitude,
          'BYRADIUS',
          radiusKm,
          'km',
          'ASC',
          'COUNT',
          count,
          'WITHDIST',
        )) as Array<[string, string]>;
        return raw.map(([member, distance]) => ({ member, distanceKm: Number(distance) }));
      } catch (error) {
        this.logger.warn(`Redis GEOSEARCH failed: ${this.message(error)}`);
      }
    }
    const index = this.geo.get(key);
    if (!index) return [];
    const results: Array<{ member: string; distanceKm: number }> = [];
    for (const [member, point] of index.entries()) {
      if (point.expiresAt && point.expiresAt <= Date.now()) {
        index.delete(member);
        continue;
      }
      const distanceKm = this.haversine(latitude, longitude, point.latitude, point.longitude);
      if (distanceKm <= radiusKm) results.push({ member, distanceKm });
    }
    return results.sort((a, b) => a.distanceKm - b.distanceKm).slice(0, count);
  }

  private haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const radians = (degrees: number) => (degrees * Math.PI) / 180;
    const dLat = radians(lat2 - lat1);
    const dLon = radians(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) ** 2 + Math.cos(radians(lat1)) * Math.cos(radians(lat2)) * Math.sin(dLon / 2) ** 2;
    return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  private message(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
