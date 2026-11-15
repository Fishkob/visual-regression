import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaConnection } from '@/prisma/prisma-connection';
import { computeWindowStart, RATE_LIMIT_WINDOW_MS } from './rate-limit-window';

// The per-scope rate-limit bucket. Deliberately NOT transaction-ambient: the
// guard runs this check before the route handler, so it writes on the bare
// connection. The atomic INSERT ... ON CONFLICT ... RETURNING rules out the
// read-then-write race a Prisma upsert would have under concurrent requests.
//
// A plain fixed window would let a client spend its full budget at the end of
// one minute and again at the start of the next (2x the limit within a second).
// The statement therefore reads the previous window's count in the same round
// trip and weights it by the share of that window still inside the rolling
// minute: at the boundary it counts fully, halfway through the minute it counts
// half. No schema change and no second statement; the counters stay
// minute-aligned rows, so the existing retention sweep still bounds the table.
@Injectable()
export class RateLimitService {
  constructor(private readonly connection: PrismaConnection) {}

  async tryConsume(
    scope: string,
    key: string,
    limit: number,
  ): Promise<{ allowed: boolean; count: number }> {
    const now = Date.now();
    const windowStart = computeWindowStart(now);
    const previousWindowStart = new Date(
      windowStart.getTime() - RATE_LIMIT_WINDOW_MS,
    );

    const rows = await this.connection.client.$queryRaw<
      { count: number; previousCount: number | null }[]
    >`
      WITH consumed AS (
        INSERT INTO "RateLimitBucket" ("id", "scope", "key", "windowStart", "count", "createdAt")
        VALUES (${randomUUID()}, ${scope}, ${key}, ${windowStart}, 1, NOW())
        ON CONFLICT ("scope", "key", "windowStart")
        DO UPDATE SET "count" = "RateLimitBucket"."count" + 1
        RETURNING "count"
      )
      SELECT
        (SELECT "count" FROM consumed) AS "count",
        (SELECT "count" FROM "RateLimitBucket"
          WHERE "scope" = ${scope}
            AND "key" = ${key}
            AND "windowStart" = ${previousWindowStart}) AS "previousCount"
    `;

    const count = rows[0]?.count ?? 0;
    const previousCount = rows[0]?.previousCount ?? 0;
    const elapsedFraction =
      (now - windowStart.getTime()) / RATE_LIMIT_WINDOW_MS;
    const weightedCount =
      count + Math.ceil(previousCount * (1 - elapsedFraction));
    return { allowed: weightedCount <= limit, count };
  }
}
