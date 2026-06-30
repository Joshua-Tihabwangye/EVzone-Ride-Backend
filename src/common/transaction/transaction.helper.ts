import { AsyncLocalStorage } from 'async_hooks';
import { DataSource, EntityManager, EntityTarget, Repository } from 'typeorm';

/**
 * AsyncLocalStorage that holds the EntityManager for the current transaction.
 * Populated by {@link Transactional} or {@link runInTransaction}.
 */
export const TransactionStore = new AsyncLocalStorage<EntityManager>();

/**
 * Returns the EntityManager bound to the current transactional context,
 * or the optional fallback manager if no context is active.
 */
export function getManager(fallback?: EntityManager): EntityManager | undefined {
  return TransactionStore.getStore() ?? fallback;
}

/**
 * Returns a TypeORM Repository bound to the current transactional EntityManager.
 * Throws if no transactional context is active and no fallback manager is provided.
 */
export function getRepository<T extends object>(entity: EntityTarget<T>, fallback?: EntityManager): Repository<T> {
  const manager = getManager(fallback);
  if (!manager) {
    throw new Error(
      'No EntityManager available. Call getRepository inside a @Transactional() method or pass a fallback manager.',
    );
  }
  return manager.getRepository(entity);
}

/**
 * Runs the provided function inside a TypeORM transaction and exposes the
 * transactional EntityManager through {@link getManager} / {@link getRepository}.
 */
export async function runInTransaction<T>(
  dataSource: DataSource,
  fn: (manager: EntityManager) => Promise<T>,
): Promise<T> {
  return dataSource.transaction(async (manager) => {
    return TransactionStore.run(manager, () => fn(manager));
  });
}
