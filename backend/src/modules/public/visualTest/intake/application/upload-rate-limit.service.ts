import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaConnection } from '@/prisma/prisma-connection';

// The per-key upload rate-limit bucket. Deliberately NOT transaction-ambient:
// the guard runs this check before the upload workflow, so it writes on the
// bare connection. The atomic INSERT ... ON CONFLICT ... RETURNING rules out
// the read-then-write race a Prisma upsert would have under concurrent uploads.
@Injectable()
export class UploadRateLimitService {
  constructor(private readonly connection: PrismaConnection) {}

  async tryConsume(
    apiKeyId: string,
    windowStart: Date,
    limit: number,
  ): Promise<{ allowed: boolean; count: number }> {
    const rows = await this.connection.client.$queryRaw<{ count: number }[]>`
      INSERT INTO "ApiKeyRateLimitBucket" ("id", "apiKeyId", "windowStart", "count", "createdAt")
      VALUES (${randomUUID()}, ${apiKeyId}, ${windowStart}, 1, NOW())
      ON CONFLICT ("apiKeyId", "windowStart")
      DO UPDATE SET "count" = "ApiKeyRateLimitBucket"."count" + 1
      RETURNING "count"
    `;
    const count = rows[0]?.count ?? 0;
    return { allowed: count <= limit, count };
  }
}
