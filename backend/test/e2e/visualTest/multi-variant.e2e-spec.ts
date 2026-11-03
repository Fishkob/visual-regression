import { INestApplication } from '@nestjs/common';
import { TestApp } from '../_support/utils/test-app';
import { PrismaConnection } from '@/prisma/prisma-connection';
import { ComparisonJobProcessor } from '@public/visualTest/intake/workers/comparison-job-processor';
import { ComparisonOutcome } from '@public/visualTest/core/domain/types/visual-test.types';
import { ScreenshotType } from '@/prisma/client';
import * as path from 'path';
import * as fs from 'fs';
import request from 'supertest';
import { authRequest } from '../_support/utils/authenticated-request';
import type { PrismaClient } from '@/prisma/client';

describe('Multi-variant screenshots (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  const uploadUrl = (testName: string) =>
    `/api/v1/projects/checkout-ui/tests/${testName}/upload?testKind=image`;

  function upload(
    testName: string,
    viewport: string,
    browser: string,
    fixture: string,
  ) {
    const filePath = path.join(__dirname, 'fixtures', fixture);
    return authRequest(app)
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
    await TestApp.createProject('checkout-ui');
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
      'baseline_blue.png',
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
    expect(new Set(baselines.map((b) => b.id)).size).toBe(2);

    const byVariant = new Map(variants.map((v) => [v.id, v.baselineId]));
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
    const chromeVariant = await prisma.unifiedVariant.findFirstOrThrow({
      where: {
        test: { name: 'MultiVariantTest' },
        browser: 'Chrome',
      },
    });
    const chromeBaselineBefore =
      await prisma.unifiedScreenshot.findUniqueOrThrow({
        where: { id: chromeVariant.baselineId! },
      });

    await upload(
      'MultiVariantTest',
      '1366x768',
      'Firefox',
      'baseline_blue.png',
    ).expect(201);

    const chromeVariantAfter = await prisma.unifiedVariant.findFirstOrThrow({
      where: {
        test: { name: 'MultiVariantTest' },
        browser: 'Chrome',
      },
    });
    const chromeBaselineAfter =
      await prisma.unifiedScreenshot.findUniqueOrThrow({
        where: { id: chromeVariantAfter.baselineId! },
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
      'baseline_blue.png',
    ).expect(201);

    const mismatch = await upload(
      'ScopedApproval',
      '1920x1080',
      'Chrome',
      'baseline_blue.png',
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

    await authRequest(app)
      .post('/api/v1/projects/checkout-ui/tests/ScopedApproval/approval')
      .send({ comparisonId: 'no-such-comparison' })
      .expect(404);

    await authRequest(app)
      .post('/api/v1/projects/checkout-ui/tests/ScopedApproval/approval')
      .send({ comparisonId: chromeDetails.body.comparison.id })
      .expect(201);
  });

  it('approves every pending variant of a test in one batch', async () => {
    const variants = [
      {
        viewport: '1920x1080',
        browser: 'Chrome',
        baseline: 'baseline_black.png',
        candidate: 'baseline_blue.png',
      },
      {
        viewport: '1366x768',
        browser: 'Firefox',
        baseline: 'baseline_blue.png',
        candidate: 'baseline_black.png',
      },
      {
        viewport: '800x600',
        browser: 'WebKit',
        baseline: 'baseline_black.png',
        candidate: 'baseline_blue.png',
      },
    ];

    for (const variant of variants) {
      const baseline = await upload(
        'BulkApproval',
        variant.viewport,
        variant.browser,
        variant.baseline,
      ).expect(201);
      expect(baseline.body.status).toBe(ComparisonOutcome.BASELINE_CREATED);

      const queued = await upload(
        'BulkApproval',
        variant.viewport,
        variant.browser,
        variant.candidate,
      ).expect(201);
      expect(queued.body.status).toBe(ComparisonOutcome.COMPARISON_QUEUED);
    }

    const pending: { comparisonId: string; candidateUrl: string }[] = [];
    for (const variant of variants) {
      const details = await waitForVariantComparison(
        app,
        'checkout-ui',
        'BulkApproval',
        variant.viewport,
        variant.browser,
      );
      expect(details.body.comparison.status).toBe('PENDING_APPROVAL');
      pending.push({
        comparisonId: details.body.comparison.id,
        candidateUrl: details.body.comparison.candidate.imageUrl,
      });
    }

    const approved = await authRequest(app)
      .post(
        '/api/v1/projects/checkout-ui/tests/BulkApproval/approvals/all?branch=main',
      )
      .expect(201);
    expect(approved.body).toEqual({ approved: 3, pending: [], failed: [] });

    // Every approved variant promoted its candidate to the baseline and the
    // image kind completes an approval by deleting the comparison row.
    const variantsAfter = await prisma.unifiedVariant.findMany({
      where: { test: { name: 'BulkApproval' } },
      include: { baseline: true },
    });
    expect(variantsAfter).toHaveLength(3);
    expect(
      variantsAfter.map((variant) => variant.baseline!.imageUrl).sort(),
    ).toEqual(pending.map((entry) => entry.candidateUrl).sort());
    for (const entry of pending) {
      expect(
        await prisma.unifiedComparison.findUnique({
          where: { id: entry.comparisonId },
        }),
      ).toBeNull();
    }
    expect(
      await prisma.unifiedComparison.findMany({
        where: {
          test: { name: 'BulkApproval' },
          status: 'PENDING_APPROVAL',
        },
      }),
    ).toHaveLength(0);

    // One durable audit row per approved comparison, attributed to the caller.
    const history = await authRequest(app)
      .get(
        '/api/v1/projects/checkout-ui/tests/BulkApproval/approvals?branch=main',
      )
      .expect(200);
    expect(history.body).toHaveLength(3);
    expect(
      history.body.map((row: { approvedBy: string }) => row.approvedBy),
    ).toEqual(['e2e', 'e2e', 'e2e']);
    expect(
      history.body.map((row: { branchName: string }) => row.branchName),
    ).toEqual(['main', 'main', 'main']);
    expect(
      history.body
        .map((row: { comparisonId: string }) => row.comparisonId)
        .sort(),
    ).toEqual(pending.map((entry) => entry.comparisonId).sort());
  });

  it('reports an empty batch when nothing is pending and rejects an unknown test', async () => {
    await upload(
      'NothingPending',
      '1920x1080',
      'Chrome',
      'baseline_black.png',
    ).expect(201);

    const empty = await authRequest(app)
      .post('/api/v1/projects/checkout-ui/tests/NothingPending/approvals/all')
      .expect(201);
    expect(empty.body).toEqual({ approved: 0, pending: [], failed: [] });

    await authRequest(app)
      .post('/api/v1/projects/checkout-ui/tests/NoSuchTest/approvals/all')
      .expect(404);
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
      'sample-v1.pdf',
    );
    await authRequest(app)
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

    const res = await authRequest(app)
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
