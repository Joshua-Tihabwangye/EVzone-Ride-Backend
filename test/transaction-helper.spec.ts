import { DataSource, EntityManager, Repository } from 'typeorm';
import {
  getManager,
  getRepository,
  runInTransaction,
  Transactional,
} from '../src/common/transaction';

describe('transaction helper', () => {
  it('runInTransaction exposes manager through getManager', async () => {
    const manager = { getRepository: jest.fn() } as unknown as EntityManager;
    const dataSource = {
      transaction: jest.fn(async (fn) => fn(manager)),
    } as unknown as DataSource;

    await runInTransaction(dataSource, async (m) => {
      expect(getManager()).toBe(m);
    });

    expect(dataSource.transaction).toHaveBeenCalled();
  });

  it('getRepository returns manager-bound repository', async () => {
    const repo = {} as unknown as Repository<object>;
    const manager = { getRepository: jest.fn().mockReturnValue(repo) } as unknown as EntityManager;
    const dataSource = {
      transaction: jest.fn(async (fn) => fn(manager)),
    } as unknown as DataSource;

    class TestEntity {}

    await runInTransaction(dataSource, async () => {
      expect(getRepository(TestEntity)).toBe(repo);
      expect(manager.getRepository).toHaveBeenCalledWith(TestEntity);
    });
  });

  it('getRepository throws outside transaction without fallback', () => {
    expect(() => getRepository(class TestEntity {})).toThrow(/No EntityManager available/);
  });

  it('getRepository uses fallback manager outside transaction', () => {
    class TestEntity {}
    const repo = {} as unknown as Repository<object>;
    const fallback = { getRepository: jest.fn().mockReturnValue(repo) } as unknown as EntityManager;

    expect(getRepository(TestEntity, fallback)).toBe(repo);
  });

  it('@Transactional decorator wraps method in dataSource.transaction', async () => {
    const manager = { getRepository: jest.fn() } as unknown as EntityManager;
    const dataSource = {
      transaction: jest.fn(async (fn) => fn(manager)),
    } as unknown as DataSource;

    class Service {
      constructor(public readonly dataSource: DataSource) {}

      @Transactional()
      async doWork() {
        return getManager();
      }
    }

    const service = new Service(dataSource);
    const result = await service.doWork();
    expect(result).toBe(manager);
    expect(dataSource.transaction).toHaveBeenCalled();
  });

  it('@Transactional decorator throws when dataSource is missing', async () => {
    class BadService {
      @Transactional()
      async doWork() {
        return 'ok';
      }
    }

    const service = new BadService();
    await expect(service.doWork()).rejects.toThrow(/requires the host class to inject/);
  });
});
