import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'async_hooks';
import { PrismaClient } from '@/prisma/client';
import { PrismaConnection } from '@/prisma/prisma-connection';
import type { Prisma } from '@/prisma/client';

@Injectable()
export class TransactionContext {
  private readonly txStorage =
    new AsyncLocalStorage<Prisma.TransactionClient>();

  constructor(private readonly connection: PrismaConnection) {}

  get client(): PrismaClient | Prisma.TransactionClient {
    return this.txStorage.getStore() ?? this.connection.client;
  }

  isInTransaction(): boolean {
    return this.txStorage.getStore() !== undefined;
  }

  // Enforces the ambient-transaction calling convention: modules whose writes
  // must join a StateChangeWorkflow transaction call this before writing, so a
  // caller that escapes the transaction fails loudly instead of silently
  // riding the bare connection (atomicity disappearing). See the JOB_PRODUCER
  // and ComparisonRetirementService contracts.
  assertInTransaction(): void {
    if (!this.isInTransaction()) {
      throw new Error(
        'Operation requires an active StateChangeWorkflow transaction but none is present — the write would silently ride the bare connection',
      );
    }
  }

  run<T>(tx: Prisma.TransactionClient, fn: () => Promise<T>): Promise<T> {
    return this.txStorage.run(tx, fn);
  }
}
