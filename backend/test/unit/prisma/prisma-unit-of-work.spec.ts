import { PrismaUnitOfWork } from '@/prisma/prisma-unit-of-work';

describe('PrismaUnitOfWork', () => {
  let uow: PrismaUnitOfWork;
  let connection: { $transaction: jest.Mock };
  let txCtx: { run: jest.Mock };

  beforeEach(() => {
    connection = {
      $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
        fn('tx'),
      ),
    };
    txCtx = {
      run: jest.fn(async (_tx: unknown, fn: () => Promise<unknown>) => fn()),
    };

    uow = new PrismaUnitOfWork(connection as any, txCtx as any);
  });

  describe('execute', () => {
    it('runs the operation inside a transaction context', async () => {
      const fn = jest.fn().mockResolvedValue('result');

      const result = await uow.execute(fn);

      expect(result).toBe('result');
      expect(connection.$transaction).toHaveBeenCalledTimes(1);
      expect(txCtx.run).toHaveBeenCalledWith('tx', fn);
    });

    it('propagates the isolationLevel to the underlying transaction', async () => {
      const fn = jest.fn().mockResolvedValue('done');

      await uow.execute(fn, { isolationLevel: 'Serializable' });

      expect(connection.$transaction).toHaveBeenCalledWith(
        expect.any(Function),
        { isolationLevel: 'Serializable' },
      );
    });
  });
});
