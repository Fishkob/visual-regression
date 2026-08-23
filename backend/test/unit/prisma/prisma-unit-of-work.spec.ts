import type { Mock } from 'vitest';
import { PrismaUnitOfWork } from '@/prisma/prisma-unit-of-work';

describe('PrismaUnitOfWork', () => {
  let uow: PrismaUnitOfWork;
  let connection: { $transaction: Mock };
  let txCtx: { run: Mock };

  beforeEach(() => {
    connection = {
      $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
        fn('tx'),
      ),
    };
    txCtx = {
      run: vi.fn(async (_tx: unknown, fn: () => Promise<unknown>) => fn()),
    };

    uow = new PrismaUnitOfWork(connection as any, txCtx as any);
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
  });
});
