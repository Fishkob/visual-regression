import { INestApplication } from '@nestjs/common';
import { PrismaConnection } from '@/prisma/prisma-connection';
import { TestApp } from '../_support/utils/test-app';
import { createBaselineWithVariant } from '../_support/utils/screenshot-fixtures';
import type { PrismaClient } from '@/prisma/client';

// The database backstop behind ComparisonRetirementService's "at most one
// reviewable comparison per variant" rule. The service retires the superseded
// row first, but two workers can pass their read at the same time; the trigger
// serialises the check per baseline. These cases fail if the trigger (or its
// advisory lock) is removed — a plain EXISTS check alone would let two
// concurrent READ COMMITTED inserts both pass.
describe('Single pending comparison invariant (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  beforeAll(async () => {
    app = await TestApp.init();
    prisma = app.get(PrismaConnection).client;
  });

  beforeEach(async () => {
    await TestApp.resetDb();
  }, 30_000);

  afterAll(async () => {
    await TestApp.close();
  });

  async function seedBaseline(viewport = '1920x1080') {
    const { branchId } = await TestApp.createProject(
      `invariant-${viewport.replace(/[^a-z0-9]/gi, '')}`,
    );
    const test = await prisma.unifiedTest.create({
      data: { name: 'login', branchId, kind: 'image' },
    });
    const { baseline } = await createBaselineWithVariant(prisma, {
      testId: test.id,
      imageHash: `baseline-${viewport}`,
      imageUrl: 'http://rustfs/baseline.png',
      viewport,
    });
    return { testId: test.id, baselineId: baseline.id };
  }

  function pending(testId: string, baselineId: string, diffUrl: string) {
    return {
      testId,
      baselineId,
      mismatchPixelCount: 1,
      diffImageUrl: diffUrl,
      status: 'PENDING_APPROVAL' as const,
    };
  }

  it('rejects a second pending comparison for the same baseline', async () => {
    const { testId, baselineId } = await seedBaseline();

    await prisma.unifiedComparison.create({
      data: pending(testId, baselineId, 'http://rustfs/diff-1.png'),
    });

    await expect(
      prisma.unifiedComparison.create({
        data: pending(testId, baselineId, 'http://rustfs/diff-2.png'),
      }),
    ).rejects.toThrow();

    expect(
      await prisma.unifiedComparison.count({
        where: { baselineId, status: 'PENDING_APPROVAL' },
      }),
    ).toBe(1);
  });

  it('lets only one of two concurrent creates win', async () => {
    const { testId, baselineId } = await seedBaseline();

    const results = await Promise.allSettled([
      prisma.unifiedComparison.create({
        data: pending(testId, baselineId, 'http://rustfs/concurrent-a.png'),
      }),
      prisma.unifiedComparison.create({
        data: pending(testId, baselineId, 'http://rustfs/concurrent-b.png'),
      }),
    ]);

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(
      await prisma.unifiedComparison.count({
        where: { baselineId, status: 'PENDING_APPROVAL' },
      }),
    ).toBe(1);
  });

  it('keeps retained approved comparisons next to one pending row', async () => {
    const { testId, baselineId } = await seedBaseline();

    await prisma.unifiedComparison.create({
      data: {
        testId,
        baselineId,
        mismatchPixelCount: 1,
        status: 'APPROVED',
      },
    });
    await prisma.unifiedComparison.create({
      data: pending(testId, baselineId, 'http://rustfs/next.png'),
    });

    expect(
      await prisma.unifiedComparison.count({ where: { baselineId } }),
    ).toBe(2);
  });

  it('drops a deleted project from every api-key allowlist', async () => {
    const { projectId } = await TestApp.createProject('scoped-key-project');
    const key = await prisma.apiKey.create({
      data: {
        name: 'scoped-key',
        keyHash: 'scoped-key-hash',
        scopes: ['read'],
        projectIds: [projectId],
      },
    });

    await prisma.project.delete({ where: { id: projectId } });

    const after = await prisma.apiKey.findUniqueOrThrow({
      where: { id: key.id },
    });
    expect(after.projectIds).toEqual([]);
  });
});
