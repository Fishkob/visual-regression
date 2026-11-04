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
    // The pg pool defaults to 10 connections per process and would otherwise be
    // invisible: with an HPA of 5 API + 5 worker replicas that is 100
    // connections against Postgres' default max_connections of 100, with none
    // left for migrations or an operator. The cap is explicit and configurable
    // so the arithmetic is a deployment decision, not a default.
    //
    // The session time zone is pinned for the same reason the cap is: the
    // default is whatever the server or the role says, and Prisma maps DateTime
    // to `timestamp(3)` WITHOUT time zone. A database that is not UTC would
    // store local wall time in columns the schema treats as UTC, and read
    // `NOW()` defaults back shifted. `options` is the one place the adapter
    // lets us state it for every connection the pool opens.
    const adapter = new PrismaPg({
      connectionString,
      max: appConfig.database.poolMax,
      options: '-c timezone=UTC',
    });
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
