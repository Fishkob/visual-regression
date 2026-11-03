import type { Mock } from 'vitest';
import { PrismaUnitOfWork } from '@/prisma/prisma-unit-of-work';
import type { PrismaConnection } from '@/prisma/prisma-connection';
import type { TransactionContext } from '@/prisma/transaction-context';

describe('PrismaUnitOfWork', () => {
  let uow: PrismaUnitOfWork;
  let connection: { $transaction: Mock };
  let txCtx: { run: Mock; isInTransaction: Mock };

  beforeEach(() => {
    connection = {
      $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
        fn('tx'),
      ),
    };
    txCtx = {
      run: vi.fn(async (_tx: unknown, fn: () => Promise<unknown>) => fn()),
      isInTransaction: vi.fn().mockReturnValue(false),
    };

    uow = new PrismaUnitOfWork(
      connection as unknown as PrismaConnection,
      txCtx as unknown as TransactionContext,
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('execute', () => {
    it('runs the operation inside a transaction context', async () => {
      const fn = vi.fn().mockResolvedValue('result');

      const result = await uow.execute(fn);

      expect(result).toBe('result');
      expect(connection.$transaction).toHaveBeenCalledTimes(1);
      expect(txCtx.run).toHaveBeenCalledWith('tx', fn);
    });

    it('propagates the isolationLevel to the underlying transaction', async () => {
      const fn = vi.fn().mockResolvedValue('done');

      await uow.execute(fn, { isolationLevel: 'Serializable' });

      expect(connection.$transaction).toHaveBeenCalledWith(
        expect.any(Function),
        { isolationLevel: 'Serializable' },
      );
    });

    it('forwards the transaction budget to the underlying transaction', async () => {
      const fn = vi.fn().mockResolvedValue('done');

      await uow.execute(fn, { timeout: 30_000, maxWait: 10_000 });

      expect(connection.$transaction).toHaveBeenCalledWith(
        expect.any(Function),
        { timeout: 30_000, maxWait: 10_000 },
      );
    });

    it('refuses to nest, because a nested transaction commits on its own connection', async () => {
      txCtx.isInTransaction.mockReturnValue(true);
      const fn = vi.fn().mockResolvedValue('result');

      await expect(uow.execute(fn)).rejects.toThrow(
        /called inside an active transaction/,
      );
      expect(connection.$transaction).not.toHaveBeenCalled();
      expect(fn).not.toHaveBeenCalled();
    });
  });
});
