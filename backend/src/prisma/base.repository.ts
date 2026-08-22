import { Injectable } from '@nestjs/common';
import { TransactionContext } from './transaction-context';
import { PrismaClient } from '@/prisma/client';
import type { Prisma } from '@/prisma/client';

@Injectable()
export abstract class BaseRepository {
  constructor(protected readonly txCtx: TransactionContext) {}

  protected get client(): PrismaClient | Prisma.TransactionClient {
    return this.txCtx.client;
  }

  // Every domain-write primitive asserts the ambient-transaction contract
  // before writing, so a mutation that escapes a StateChangeWorkflow
  // transaction fails loudly at the write instead of silently riding the bare
  // connection. The orchestration owners (retirement, reclamation) assert too;
  // this backstop means a future caller that reaches a repo directly cannot
  // silently break atomicity. Standalone writes that legitimately run outside
  // a state change (e.g. ProjectRepository.create) intentionally skip it.
  protected assertWritable(): void {
    this.txCtx.assertInTransaction();
  }
}
