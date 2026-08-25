import { INestApplication } from '@nestjs/common';
import { TestApp } from '../_support/utils/test-app';
import { PrismaConnection } from '@/prisma/prisma-connection';
import { ComparisonStatus, TestStatus } from '@/prisma/client';
import { authRequest } from '../_support/utils/authenticated-request';

describe('GET /projects/:projectName/tests/meta/pending (e2e)', () => {
  let app: INestApplication;
  let prisma: any;

  beforeAll(async () => {
    app = await TestApp.init();
    prisma = app.get(PrismaConnection).client;
  });

  beforeEach(async () => {
    await TestApp.resetDb();

    const project = await prisma.project.create({
      data: { name: 'checkout-ui' },
    });

    const test = await prisma.unifiedTest.create({
      data: {
        name: 'LoginForm',
        projectId: project.id,
        kind: 'image',
        status: TestStatus.PENDING,
      },
    });

    const baseline = await prisma.unifiedScreenshot.create({
      data: {
        testId: test.id,
        type: 'BASELINE',
        imageHash: 'abc',
        imageUrl: 'http://rustfs/baseline.png',
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

    const candidate = await prisma.unifiedScreenshot.create({
      data: {
        testId: test.id,
        type: 'CURRENT',
        imageHash: 'def',
        imageUrl: 'http://rustfs/current.png',
      },
    });

    await prisma.unifiedComparison.create({
      data: {
        testId: test.id,
        baselineId: baseline.id,
        candidateId: candidate.id,
        diffImageUrl: 'http://rustfs/diff.png',
        mismatchPixelCount: 42,
        status: ComparisonStatus.PENDING_APPROVAL,
      },
    });
  });

  afterAll(async () => {
    await TestApp.close();
  });

  it('should return all tests with PENDING_APPROVAL status', async () => {
    const res = await authRequest(app)
      .get('/api/v1/projects/checkout-ui/tests/meta/pending')
      .expect(200);

    expect(res.body.data).toEqual([
      {
        name: 'LoginForm',
        variant: {
          viewport: '1920x1080',
          browser: 'Chrome',
          environment: 'staging',
        },
        latestStatus: 'PENDING_APPROVAL',
      },
    ]);
  });
});
