import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { AppConfigService } from '@config/app-config.service';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@/prisma/client';
import type { Prisma } from '@/prisma/client';

@Injectable()
export class PrismaConnection implements OnModuleInit, OnModuleDestroy {
  readonly client: PrismaClient;

  constructor(appConfig: AppConfigService) {
    const connectionString = appConfig.database.url;
    const adapter = new PrismaPg({ connectionString });
    this.client = new PrismaClient({ adapter });
  }

  $transaction<T>(
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
    options?: {
      maxWait?: number;
      timeout?: number;
      isolationLevel?: Prisma.TransactionIsolationLevel;
    },
  ): Promise<T> {
    return this.client.$transaction(fn, options);
  }

  $queryRaw<T = unknown>(
    query: TemplateStringsArray | Prisma.Sql,
    ...values: unknown[]
  ): Promise<T> {
    return this.client.$queryRaw<T>(query, ...values);
  }

  async onModuleInit(): Promise<void> {
    await this.client.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.$disconnect();
  }
}
