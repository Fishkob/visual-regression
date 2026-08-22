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
    return this.connection.$transaction(
      async (tx) => this.txCtx.run(tx, fn),
      options,
    );
  }
}
