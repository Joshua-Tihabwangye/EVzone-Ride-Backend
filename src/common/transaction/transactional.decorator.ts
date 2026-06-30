import { DataSource, EntityManager } from 'typeorm';
import { TransactionStore } from './transaction.helper';

/**
 * Method decorator that runs the decorated method inside a TypeORM transaction.
 *
 * The host class must inject a TypeORM {@link DataSource} as `this.dataSource`.
 * Inside the method (and any awaited calls) the transactional EntityManager is
 * available via {@link getManager} / {@link getRepository}.
 *
 * @example
 * class MyService {
 *   constructor(private readonly dataSource: DataSource) {}
 *
 *   @Transactional()
 *   async transfer(from: string, to: string, amount: number) {
 *     const wallets = getRepository(Wallet);
 *     // all DB work is part of the same transaction
 *   }
 * }
 */
export function Transactional(): MethodDecorator {
  return function (target: object, propertyKey: string | symbol, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value as (...args: unknown[]) => Promise<unknown>;

    descriptor.value = async function (
      this: { dataSource?: DataSource },
      ...args: unknown[]
    ): Promise<unknown> {
      const dataSource = this.dataSource;
      if (!dataSource) {
        throw new Error(
          `@Transactional() requires the host class to inject a TypeORM DataSource as "dataSource".`,
        );
      }

      // Reuse an active transactional context so nested @Transactional() calls
      // participate in the same unit of work instead of starting a new transaction.
      const existing = TransactionStore.getStore();
      if (existing) {
        return originalMethod.apply(this, args);
      }

      return dataSource.transaction(async (manager: EntityManager) => {
        return TransactionStore.run(manager, () => originalMethod.apply(this, args));
      });
    } as typeof originalMethod;
  };
}
