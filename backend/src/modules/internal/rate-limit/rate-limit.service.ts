import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaConnection } from '@/prisma/prisma-connection';
import { computeWindowStart } from './rate-limit-window';

// The per-scope rate-limit bucket. Deliberately NOT transaction-ambient: the
// guard runs this check before the route handler, so it writes on the bare
// connection. The atomic INSERT ... ON CONFLICT ... RETURNING rules out the
// read-then-write race a Prisma upsert would have under concurrent requests.
@Injectable()
export class RateLimitService {
  constructor(private readonly connection: PrismaConnection) {}

  async tryConsume(
    scope: string,
    key: string,
    limit: number,
  ): Promise<{ allowed: boolean; count: number }> {
    const windowStart = computeWindowStart(Date.now());
    const rows = await this.connection.client.$queryRaw<{ count: number }[]>`
      INSERT INTO "RateLimitBucket" ("id", "scope", "key", "windowStart", "count", "createdAt")
      VALUES (${randomUUID()}, ${scope}, ${key}, ${windowStart}, 1, NOW())
      ON CONFLICT ("scope", "key", "windowStart")
      DO UPDATE SET "count" = "RateLimitBucket"."count" + 1
      RETURNING "count"
    `;
    const count = rows[0]?.count ?? 0;
    return { allowed: count <= limit, count };
  }
}
