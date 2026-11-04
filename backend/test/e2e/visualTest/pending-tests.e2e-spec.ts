import { INestApplication } from '@nestjs/common';
import { TestApp } from '../_support/utils/test-app';
import { PrismaConnection } from '@/prisma/prisma-connection';
import { ComparisonStatus, TestStatus } from '@/prisma/client';
import { authRequest } from '../_support/utils/authenticated-request';
import {
  createBaselineWithVariant,
  variantIdForBaseline,
} from '../_support/utils/screenshot-fixtures';
import type { PrismaClient } from '@/prisma/client';

describe('GET /projects/:projectName/tests/meta/pending (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let branchId: string;

  beforeAll(async () => {
    app = await TestApp.init();
    prisma = app.get(PrismaConnection).client;
  });

  beforeEach(async () => {
    await TestApp.resetDb();

    ({ branchId } = await TestApp.createProject('checkout-ui'));

    const test = await prisma.unifiedTest.create({
      data: {
        name: 'LoginForm',
        branchId,
        kind: 'image',
        status: TestStatus.PENDING,
      },
    });

    const { baseline } = await createBaselineWithVariant(prisma, {
      testId: test.id,
      imageHash: 'abc',
      imageUrl: 'http://rustfs/baseline.png',
    });

    const candidate = await prisma.unifiedScreenshot.create({
      data: {
        testId: test.id,
        variantId: await variantIdForBaseline(prisma, baseline.id),
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

  it('filters the pass by kind and by search text', async () => {
    const pdfTest = await prisma.unifiedTest.create({
      data: {
        name: 'Report',
        branchId,
        kind: 'pdf',
        status: TestStatus.PENDING_APPROVAL,
      },
    });
    const pdfVariant = await prisma.unifiedVariant.create({
      data: {
        testId: pdfTest.id,
        viewport: '1920x1080',
        browser: 'Chrome',
        environment: 'staging',
      },
    });
    const pdfBaseline = await prisma.unifiedScreenshot.create({
      data: {
        testId: pdfTest.id,
        variantId: pdfVariant.id,
        type: 'BASELINE',
        imageHash: 'pdf-base',
        imageUrl: 'http://rustfs/report.pdf',
        pageCount: 3,
      },
    });
    await prisma.unifiedVariant.update({
      where: { id: pdfVariant.id },
      data: { baselineId: pdfBaseline.id },
    });
    const pdfCandidate = await prisma.unifiedScreenshot.create({
      data: {
        testId: pdfTest.id,
        variantId: pdfVariant.id,
        type: 'CURRENT',
        imageHash: 'pdf-current',
        imageUrl: 'http://rustfs/report-current.pdf',
        pageCount: 3,
      },
    });
    await prisma.unifiedComparison.create({
      data: {
        testId: pdfTest.id,
        baselineId: pdfBaseline.id,
        candidateId: pdfCandidate.id,
        diffPdfUrl: 'http://rustfs/report.diff.pdf',
        mismatchPixelCount: 0,
        mismatchPageCount: 1,
        pageCount: 3,
        status: ComparisonStatus.PENDING_APPROVAL,
      },
    });

    const imageOnly = await authRequest(app)
      .get('/api/v1/projects/checkout-ui/tests/meta/pending?kind=image')
      .expect(200);
    expect(
      imageOnly.body.data.map((row: { name: string }) => row.name),
    ).toEqual(['LoginForm']);

    const pdfOnly = await authRequest(app)
      .get('/api/v1/projects/checkout-ui/tests/meta/pending?kind=pdf')
      .expect(200);
    expect(pdfOnly.body.data.map((row: { name: string }) => row.name)).toEqual([
      'Report',
    ]);

    const searched = await authRequest(app)
      .get('/api/v1/projects/checkout-ui/tests/meta/pending?q=login')
      .expect(200);
    expect(searched.body.data.map((row: { name: string }) => row.name)).toEqual(
      ['LoginForm'],
    );
  });
});
