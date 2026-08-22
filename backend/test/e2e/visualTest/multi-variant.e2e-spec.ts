import { INestApplication } from '@nestjs/common';
import { TestApp } from '../_support/utils/test-app';
import { PrismaConnection } from '@/prisma/prisma-connection';
import { ComparisonJobProcessor } from '@public/visualTest/intake/workers/comparison-job-processor';
import { ComparisonOutcome } from '@public/visualTest/core/domain/types/visual-test.types';
import { ScreenshotType } from '@/prisma/client';
import * as path from 'path';
import * as fs from 'fs';
import request from 'supertest';

describe('Multi-variant screenshots (e2e)', () => {
  let app: INestApplication;
  let prisma: any;

  const uploadUrl = (testName: string) =>
    `/api/v1/projects/checkout-ui/tests/${testName}/upload?testKind=image`;

  function upload(
    testName: string,
    viewport: string,
    browser: string,
    fixture: string,
  ) {
    const filePath = path.join(__dirname, 'fixtures', fixture);
    return request(app.getHttpServer())
      .post(uploadUrl(testName))
      .field('viewport', viewport)
      .field('browser', browser)
      .field('environment', 'staging')
      .attach('file', fs.createReadStream(filePath));
  }

  beforeAll(async () => {
    app = await TestApp.init();
    prisma = app.get(PrismaConnection).client;
  });

  beforeEach(async () => {
    await TestApp.resetDb();
    await prisma.project.create({ data: { name: 'checkout-ui' } });
  });

  afterAll(async () => {
    await TestApp.close();
  });

  it('keeps each variant baseline separate when uploading two variants', async () => {
    const first = await upload(
      'MultiVariantTest',
      '1920x1080',
      'Chrome',
      'baseline_black.png',
    ).expect(201);
    expect(first.body.status).toBe(ComparisonOutcome.BASELINE_CREATED);

    const second = await upload(
      'MultiVariantTest',
      '1366x768',
      'Firefox',
      'baseline_red.png',
    ).expect(201);
    expect(second.body.status).toBe(ComparisonOutcome.BASELINE_CREATED);

    const variants = await prisma.unifiedVariant.findMany({
      where: { test: { name: 'MultiVariantTest' } },
      orderBy: { viewport: 'asc' },
    });
    expect(variants).toHaveLength(2);
    expect(variants[0].baselineId).not.toBeNull();
    expect(variants[1].baselineId).not.toBeNull();
    expect(variants[0].baselineId).not.toBe(variants[1].baselineId);

    const baselines = await prisma.unifiedScreenshot.findMany({
      where: {
        test: { name: 'MultiVariantTest' },
        type: ScreenshotType.BASELINE,
      },
    });
    expect(baselines).toHaveLength(2);
    expect(new Set(baselines.map((b: { id: string }) => b.id)).size).toBe(2);

    const byVariant = new Map(
      variants.map((v: { id: string; baselineId: string }) => [
        v.id,
        v.baselineId,
      ]),
    );
    const uniqueBaselineIds = new Set(byVariant.values());
    expect(uniqueBaselineIds.size).toBe(2);
  });

  it('keeps the first variant baseline intact after a second variant upload', async () => {
    await upload(
      'MultiVariantTest',
      '1920x1080',
      'Chrome',
      'baseline_black.png',
    ).expect(201);
    const chromeVariant = await prisma.unifiedVariant.findFirst({
      where: {
        test: { name: 'MultiVariantTest' },
        browser: 'Chrome',
      },
    });
    const chromeBaselineBefore = await prisma.unifiedScreenshot.findUnique({
      where: { id: chromeVariant.baselineId },
    });

    await upload(
      'MultiVariantTest',
      '1366x768',
      'Firefox',
      'baseline_red.png',
    ).expect(201);

    const chromeVariantAfter = await prisma.unifiedVariant.findFirst({
      where: {
        test: { name: 'MultiVariantTest' },
        browser: 'Chrome',
      },
    });
    const chromeBaselineAfter = await prisma.unifiedScreenshot.findUnique({
      where: { id: chromeVariantAfter.baselineId },
    });

    expect(chromeVariantAfter.baselineId).toBe(chromeVariant.baselineId);
    expect(chromeBaselineAfter.imageHash).toBe(chromeBaselineBefore.imageHash);
    expect(chromeBaselineAfter.imageUrl).toBe(chromeBaselineBefore.imageUrl);
  });

  it('scopes image approval to the variant under review', async () => {
    await upload(
      'ScopedApproval',
      '1920x1080',
      'Chrome',
      'baseline_black.png',
    ).expect(201);
    await upload(
      'ScopedApproval',
      '1366x768',
      'Firefox',
      'baseline_red.png',
    ).expect(201);

    const mismatch = await upload(
      'ScopedApproval',
      '1920x1080',
      'Chrome',
      'baseline_red.png',
    ).expect(201);
    expect(mismatch.body.status).toBe(ComparisonOutcome.COMPARISON_QUEUED);

    const chromeDetails = await waitForVariantComparison(
      app,
      'checkout-ui',
      'ScopedApproval',
      '1920x1080',
      'Chrome',
    );
    expect(chromeDetails.body.comparison.status).toBe('PENDING_APPROVAL');

    await request(app.getHttpServer())
      .post('/api/v1/projects/checkout-ui/tests/ScopedApproval/approval')
      .send({ comparisonId: 'no-such-comparison' })
      .expect(404);

    await request(app.getHttpServer())
      .post('/api/v1/projects/checkout-ui/tests/ScopedApproval/approval')
      .send({ comparisonId: chromeDetails.body.comparison.id })
      .expect(201);
  });

  it('rejects an upload whose kind conflicts with the persisted test kind', async () => {
    await upload(
      'KindConflict',
      '1920x1080',
      'Chrome',
      'baseline_black.png',
    ).expect(201);

    const pdfPath = path.join(
      __dirname,
      '..',
      'pdfTest',
      'fixtures',
      'sample.pdf',
    );
    await request(app.getHttpServer())
      .post(
        '/api/v1/projects/checkout-ui/tests/KindConflict/upload?testKind=pdf',
      )
      .field('viewport', 'A4')
      .field('browser', 'pdf')
      .field('environment', 'production')
      .attach('file', fs.createReadStream(pdfPath))
      .expect(409);
  });
});

async function waitForVariantComparison(
  app: INestApplication,
  projectName: string,
  testName: string,
  viewport: string,
  browser: string,
): Promise<request.Response> {
  const start = Date.now();
  const db = app.get(PrismaConnection).client;
  const processor = app.get(ComparisonJobProcessor);

  while (Date.now() - start < 15_000) {
    const pendingJobs = await db.comparisonJob.findMany({
      where: { status: 'PENDING' },
      orderBy: { createdAt: 'asc' },
    });
    for (const job of pendingJobs) {
      await processor.processJob({
        id: job.id,
        payload:
          job.payload as unknown as import('@common/domain/job-queue.interface').QueuedJob['payload'],
      });
      await db.comparisonJob
        .delete({ where: { id: job.id } })
        .catch(() => undefined);
    }

    const res = await request(app.getHttpServer())
      .get(
        `/api/v1/projects/${projectName}/tests/${testName}?viewport=${viewport}&browser=${browser}&environment=staging`,
      )
      .expect(200);

    if (res.body.comparison) {
      return res;
    }

    await new Promise((r) => setTimeout(r, 200));
  }

  throw new Error(
    `Timed out waiting for comparison (${projectName}/${testName}/${viewport})`,
  );
}
