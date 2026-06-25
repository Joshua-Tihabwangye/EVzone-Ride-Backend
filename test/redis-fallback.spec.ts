import { ConfigService } from '@nestjs/config';
import { RedisService } from '../src/infrastructure/redis.service';

describe('Redis resilient fallback', () => {
  it('stores expiring JSON values without an external Redis server', async () => {
    const service = new RedisService(new ConfigService({ REDIS_DISABLED: 'true' }));
    await service.setJson('session:test', { active: true }, 60);
    await expect(service.getJson('session:test')).resolves.toEqual({ active: true });
    await service.delete('session:test');
    await expect(service.get('session:test')).resolves.toBeNull();
  });

  it('performs nearest-driver geo searches using the in-memory fallback', async () => {
    const service = new RedisService(new ConfigService({ REDIS_DISABLED: 'true' }));
    await service.geoAdd('geo:test', 'near', 32.5811, 0.3136, 60);
    await service.geoAdd('geo:test', 'far', 32.4435, 0.0424, 60);
    const matches = await service.geoSearch('geo:test', 32.58, 0.315, 5, 10);
    expect(matches.map((item) => item.member)).toEqual(['near']);
  });
});
