import { Injectable } from '@nestjs/common';
import { PrismaConnection } from './prisma-connection';
import { TransactionContext } from './transaction-context';
import { Prisma } from '@/prisma/client';

@Injectable()
export class PrismaUnitOfWork {
  constructor(
    private readonly connection: PrismaConnection,
    private readonly txCtx: TransactionContext,
  ) {}

  async execute<T>(
    fn: () => Promise<T>,
    options?: { isolationLevel?: Prisma.TransactionIsolationLevel },
  ): Promise<T> {
    // Nesting is not a transaction: `connection.$transaction` would take a
    // second pooled connection and commit it on its own, so an inner failure
    // could not roll the outer writes back. Fail loudly instead — a caller that
    // reaches this belongs inside the ambient change, or outside any.
    if (this.txCtx.isInTransaction()) {
      throw new Error(
        'PrismaUnitOfWork.execute called inside an active transaction — the nested transaction would commit on its own connection. Ride the ambient transaction (pass the work into the StateChangeWorkflow change) or run it outside.',
      );
    }
    return this.connection.$transaction(
      async (tx) => this.txCtx.run(tx, fn),
      options,
    );
  }
}
