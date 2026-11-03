import { Injectable } from '@nestjs/common';
import { PrismaConnection } from '@/prisma/prisma-connection';
import { Prisma, TestKind, TestStatus } from '@/prisma/client';
import { DomainError } from '@common/domain/domain-error';
import { RANKED_CTE } from '@public/visualTest/core/infrastructure/repositories/branch-chain.sql';

export interface EffectiveTest {
  id: string;
  name: string;
  kind: TestKind;
  status: TestStatus;
  createdAt: Date;
  origin: 'branch' | 'inherited';
  inheritedFrom: string | null;
}

interface EffectiveTestRow {
  id: string;
  name: string;
  kind: TestKind;
  status: TestStatus;
  createdAt: Date;
  branchId: string;
  branchName: string;
  isOwn: boolean;
  total?: bigint;
}

const effectiveWhere = (kind?: TestKind) =>
  kind ? Prisma.sql`r."rn" = 1 AND r."kind" = ${kind}` : Prisma.sql`r."rn" = 1`;

@Injectable()
export class BranchTestRepository {
  constructor(private readonly connection: PrismaConnection) {}

  private get client() {
    return this.connection.client;
  }

  // Pagination is optional by design: the project overview wants the whole
  // effective set, and an omitted LIMIT used to cap it silently at 1000.
  async findEffectiveTests(
    branchId: string,
    pagination?: { skip: number; take: number },
    kind?: TestKind,
  ): Promise<{ data: EffectiveTest[]; total: number }> {
    const page = pagination
      ? Prisma.sql`OFFSET ${pagination.skip} LIMIT ${pagination.take}`
      : Prisma.empty;
    const rows = await this.client.$queryRaw<EffectiveTestRow[]>(Prisma.sql`
      ${RANKED_CTE(branchId)}
      SELECT r."id", r."name", r."kind", r."status", r."createdAt",
             r."branchId", b."name" AS "branchName",
             (r."depth" = 0) AS "isOwn",
             COUNT(*) OVER() AS "total"
      FROM ranked r
      JOIN "Branch" b ON b."id" = r."branchId"
      WHERE ${effectiveWhere(kind)}
      ORDER BY r."name" ASC
      ${page}
    `);
    if (rows.length > 0) {
      return {
        data: rows.map(toEffectiveTest),
        total: Number(rows[0].total ?? 0),
      };
    }
    // An empty page carries no window count, so a page past the end would report
    // total 0. Ask for the size explicitly instead.
    if (!pagination) return { data: [], total: 0 };
    const counted = await this.client.$queryRaw<{ total: bigint }[]>(Prisma.sql`
      ${RANKED_CTE(branchId)}
      SELECT COUNT(*) AS "total"
      FROM ranked r
      WHERE ${effectiveWhere(kind)}
    `);
    return { data: [], total: Number(counted[0]?.total ?? 0) };
  }

  async findEffectiveTest(
    branchId: string,
    testName: string,
  ): Promise<EffectiveTest | null> {
    const rows = await this.client.$queryRaw<EffectiveTestRow[]>(Prisma.sql`
      ${RANKED_CTE(branchId, testName)}
      SELECT r."id", r."name", r."kind", r."status", r."createdAt",
             r."branchId", b."name" AS "branchName",
             (r."depth" = 0) AS "isOwn"
      FROM ranked r
      JOIN "Branch" b ON b."id" = r."branchId"
      WHERE r."rn" = 1
      LIMIT 1
    `);
    return rows[0] ? toEffectiveTest(rows[0]) : null;
  }

  async findOwnTest(
    branchId: string,
    testName: string,
  ): Promise<EffectiveTest | null> {
    const row = await this.client.unifiedTest.findFirst({
      where: { branchId, name: testName },
      select: {
        id: true,
        name: true,
        kind: true,
        status: true,
        createdAt: true,
      },
    });
    return row
      ? {
          ...row,
          origin: 'branch',
          inheritedFrom: null,
        }
      : null;
  }

  async assertKindMatchesChain(
    branchId: string,
    testName: string,
    kind: TestKind,
  ): Promise<void> {
    const inherited = await this.findEffectiveTest(branchId, testName);
    if (inherited?.origin === 'inherited' && inherited.kind !== kind) {
      throw new DomainError(
        `Test "${testName}" is a ${inherited.kind} test in the target branch and cannot be uploaded as a ${kind} test`,
        'CONFLICT',
      );
    }
  }
}

function toEffectiveTest(row: EffectiveTestRow): EffectiveTest {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    status: row.status,
    createdAt: row.createdAt,
    origin: row.isOwn ? 'branch' : 'inherited',
    inheritedFrom: row.isOwn ? null : row.branchName,
  };
}
