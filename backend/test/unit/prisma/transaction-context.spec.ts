import { TransactionContext } from '@/prisma/transaction-context';
import { PrismaConnection } from '@/prisma/prisma-connection';

describe('TransactionContext', () => {
  let txCtx: TransactionContext;
  let connection: jest.Mocked<Pick<PrismaConnection, 'client'>>;

  beforeEach(() => {
    connection = { client: {} as never };
    txCtx = new TransactionContext(connection as never);
  });

  describe('isInTransaction', () => {
    it('returns false outside a transaction', () => {
      expect(txCtx.isInTransaction()).toBe(false);
    });

    it('returns true inside a transaction', async () => {
      let observed = false;
      await txCtx.run({} as never, async () => {
        observed = txCtx.isInTransaction();
      });
      expect(observed).toBe(true);
    });
  });

  describe('assertInTransaction', () => {
    it('throws outside a transaction', () => {
      expect(() => txCtx.assertInTransaction()).toThrow(
        /requires an active StateChangeWorkflow transaction/,
      );
    });

    it('does not throw inside a transaction', async () => {
      await txCtx.run({} as never, async () => {
        expect(() => txCtx.assertInTransaction()).not.toThrow();
      });
    });
  });
});
