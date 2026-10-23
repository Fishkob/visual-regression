import { INestApplication } from '@nestjs/common';
import { TestApp } from '../_support/utils/test-app';
import { PrismaConnection } from '@/prisma/prisma-connection';
import { ComparisonStatus, TestStatus } from '@/prisma/client';
import { authRequest } from '../_support/utils/authenticated-request';

const OLDER_CREATED_AT = new Date('2026-10-01T10:00:00.000Z');
const NEWER_CREATED_AT = new Date('2026-10-02T10:00:00.000Z');

async function seedTestWithBaseline(
  prisma: any,
  options: {
    projectName: string;
    testName: string;
    groupId?: string | null;
    testStatus?: TestStatus;
  },
) {
  const project = await prisma.project.create({
    data: { name: options.projectName, groupId: options.groupId ?? null },
  });
  const test = await prisma.unifiedTest.create({
    data: {
      name: options.testName,
      projectId: project.id,
      status: options.testStatus ?? TestStatus.PENDING_APPROVAL,
    },
  });
  const baseline = await prisma.unifiedScreenshot.create({
    data: {
      testId: test.id,
      type: 'BASELINE',
      imageHash: `${options.projectName}-${options.testName}-base`,
      imageUrl: 'http://rustfs/base.png',
    },
  });
  await prisma.unifiedVariant.create({
    data: {
      testId: test.id,
      viewport: '1920x1080',
      browser: 'Chrome',
      environment: 'staging',
      baselineId: baseline.id,
    },
  });
  return { project, test, baseline };
}

async function seedComparison(
  prisma: any,
  options: {
    projectName: string;
    testName: string;
    status: ComparisonStatus;
    createdAt: Date;
    groupId?: string | null;
    mismatchPixelCount?: number;
  },
) {
  const { project, test, baseline } = await seedTestWithBaseline(prisma, {
    projectName: options.projectName,
    testName: options.testName,
    groupId: options.groupId,
    testStatus:
      options.status === ComparisonStatus.PENDING_APPROVAL
        ? TestStatus.PENDING_APPROVAL
        : TestStatus.UNCHANGED,
  });
  const candidate = await prisma.unifiedScreenshot.create({
    data: {
      testId: test.id,
      type: 'CURRENT',
      imageHash: `${options.projectName}-${options.testName}-curr`,
      imageUrl: 'http://rustfs/curr.png',
    },
  });
  const comparison = await prisma.unifiedComparison.create({
    data: {
      testId: test.id,
      baselineId: baseline.id,
      candidateId: candidate.id,
      mismatchPixelCount: options.mismatchPixelCount ?? 42,
      diffImageUrl: 'http://rustfs/diff.png',
      status: options.status,
      createdAt: options.createdAt,
    },
  });
  return { project, test, comparison };
}

describe('Review inbox (e2e)', () => {
  let app: INestApplication;
  let prisma: any;

  beforeAll(async () => {
    app = await TestApp.init();
    prisma = app.get(PrismaConnection).client;
  });

  afterAll(async () => {
    await TestApp.close();
  });

  beforeEach(async () => {
    await TestApp.resetDb();
  }, 30_000);

  it('returns pending reviews across projects, oldest first', async () => {
    const older = await seedComparison(prisma, {
      projectName: 'legacy-ui',
      testName: 'signup',
      status: ComparisonStatus.PENDING_APPROVAL,
      createdAt: OLDER_CREATED_AT,
      groupId: null,
      mismatchPixelCount: 12,
    });

    const group = await prisma.projectGroup.create({
      data: { name: 'Checkout' },
    });
    const newer = await seedComparison(prisma, {
      projectName: 'checkout-ui',
      testName: 'login',
      status: ComparisonStatus.PENDING_APPROVAL,
      createdAt: NEWER_CREATED_AT,
      groupId: group.id,
      mismatchPixelCount: 42,
    });

    const approved = await seedComparison(prisma, {
      projectName: 'approved-ui',
      testName: 'profile',
      status: ComparisonStatus.APPROVED,
      createdAt: OLDER_CREATED_AT,
      mismatchPixelCount: 0,
    });

    await seedTestWithBaseline(prisma, {
      projectName: 'baseline-only-ui',
      testName: 'dashboard',
      testStatus: TestStatus.UNCHANGED,
    });

    const res = await authRequest(app)
      .get('/api/v1/review/pending')
      .expect(200);

    expect(res.body.data).toHaveLength(2);
    expect(res.body.meta.total).toBe(2);
    expect(
      res.body.data.map((row: { comparisonId: string }) => row.comparisonId),
    ).toEqual([older.comparison.id, newer.comparison.id]);

    expect(res.body.data[0]).toMatchObject({
      comparisonId: older.comparison.id,
      projectName: 'legacy-ui',
      groupId: null,
      groupName: null,
      testName: 'signup',
      kind: 'image',
      variant: {
        viewport: '1920x1080',
        browser: 'Chrome',
        environment: 'staging',
      },
      mismatchPixelCount: 12,
    });

    expect(res.body.data[1]).toMatchObject({
      comparisonId: newer.comparison.id,
      projectName: 'checkout-ui',
      groupId: group.id,
      groupName: 'Checkout',
      testName: 'login',
      kind: 'image',
      variant: {
        viewport: '1920x1080',
        browser: 'Chrome',
        environment: 'staging',
      },
      mismatchPixelCount: 42,
    });

    expect(
      res.body.data.map((row: { comparisonId: string }) => row.comparisonId),
    ).not.toContain(approved.comparison.id);
  });

  it('paginates pending reviews while keeping the total count', async () => {
    const older = await seedComparison(prisma, {
      projectName: 'legacy-ui',
      testName: 'signup',
      status: ComparisonStatus.PENDING_APPROVAL,
      createdAt: OLDER_CREATED_AT,
      groupId: null,
    });
    const newer = await seedComparison(prisma, {
      projectName: 'checkout-ui',
      testName: 'login',
      status: ComparisonStatus.PENDING_APPROVAL,
      createdAt: NEWER_CREATED_AT,
    });

    const res = await authRequest(app)
      .get('/api/v1/review/pending?skip=1&take=1')
      .expect(200);

    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0]).toMatchObject({
      comparisonId: newer.comparison.id,
      projectName: 'checkout-ui',
    });
    expect(res.body.meta.total).toBe(2);
    expect(res.body.data[0].comparisonId).not.toBe(older.comparison.id);
  });
});
