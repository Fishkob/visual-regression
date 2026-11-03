import { INestApplication } from '@nestjs/common';
import { TestApp } from '../_support/utils/test-app';
import { PrismaConnection } from '@/prisma/prisma-connection';
import type { JobData } from '@common/domain/job-data.types';
import { ComparisonJobProcessor } from '@public/visualTest/intake/workers/comparison-job-processor';
import { ComparisonOutcome } from '@public/visualTest/core/domain/types/visual-test.types';
import * as path from 'path';
import * as fs from 'fs';
import { authRequest } from '../_support/utils/authenticated-request';

// A queued job stores its payload as JSON; the processor takes it typed.
const payloadOf = (job: { payload: unknown }): JobData =>
  job.payload as JobData;

describe('Cross-variant retirement (e2e)', () => {
  let app: INestApplication;

  const uploadUrl = (testName: string) =>
    `/api/v1/projects/checkout-ui/tests/${testName}/upload?testKind=image`;

  function upload(testName: string, viewport: string, fixture: string) {
    const filePath = path.join(__dirname, 'fixtures', fixture);
    return authRequest(app)
      .post(uploadUrl(testName))
      .field('viewport', viewport)
      .field('browser', 'Chrome')
      .field('environment', 'staging')
      .attach('file', fs.createReadStream(filePath));
  }

  beforeAll(async () => {
    app = await TestApp.init();
  });

  beforeEach(async () => {
    await TestApp.resetDb();
    await TestApp.createProject('checkout-ui');
  });

  afterAll(async () => {
    await TestApp.close();
  });

  it("keeps variant A's pending comparison when variant B is uploaded", async () => {
    await upload(
      'CrossVariantRetire',
      '1920x1080',
      'baseline_black.png',
    ).expect(201);
    await upload('CrossVariantRetire', '1366x768', 'baseline_blue.png').expect(
      201,
    );

    const queuedA = await upload(
      'CrossVariantRetire',
      '1920x1080',
      'baseline_blue.png',
    ).expect(201);
    expect(queuedA.body.status).toBe(ComparisonOutcome.COMPARISON_QUEUED);

    const db = app.get(PrismaConnection).client;
    const processor = app.get(ComparisonJobProcessor);
    const jobs = await db.comparisonJob.findMany({
      orderBy: { createdAt: 'asc' },
    });
    for (const job of jobs) {
      await processor.processJob({ id: job.id, payload: payloadOf(job) });
      await db.comparisonJob
        .delete({ where: { id: job.id } })
        .catch(() => undefined);
    }

    const pendingA = await db.unifiedComparison.count({
      where: { status: 'PENDING_APPROVAL' },
    });
    expect(pendingA).toBe(1);

    const pendingBeforeB = await db.unifiedComparison.findFirst({
      where: { status: 'PENDING_APPROVAL' },
    });

    // Uploading variant B must NOT retire variant A's pending comparison.
    await upload('CrossVariantRetire', '1366x768', 'baseline_black.png').expect(
      201,
    );

    const pendingAfterB = await db.unifiedComparison.findMany({
      where: { status: 'PENDING_APPROVAL' },
    });
    expect(pendingAfterB).toHaveLength(1);
    expect(pendingAfterB[0]?.id).toBe(pendingBeforeB?.id);
  });

  it("keeps variant A's queued job when variant B is uploaded before it is processed", async () => {
    await upload(
      'CrossVariantRetire',
      '1920x1080',
      'baseline_black.png',
    ).expect(201);
    await upload('CrossVariantRetire', '1920x1080', 'baseline_blue.png').expect(
      201,
    );
    await upload('CrossVariantRetire', '1366x768', 'baseline_blue.png').expect(
      201,
    );
    await upload('CrossVariantRetire', '1366x768', 'baseline_black.png').expect(
      201,
    );

    const db = app.get(PrismaConnection).client;
    const jobs = await db.comparisonJob.findMany({
      orderBy: { createdAt: 'asc' },
    });
    expect(jobs).toHaveLength(2);
    const variantAJob = jobs.find(
      (j) => payloadOf(j).variant.viewport === '1920x1080',
    );
    const variantBJob = jobs.find(
      (j) => payloadOf(j).variant.viewport === '1366x768',
    );
    expect(variantAJob).toBeDefined();
    expect(variantBJob).toBeDefined();

    const processor = app.get(ComparisonJobProcessor);
    for (const job of jobs) {
      await processor.processJob({ id: job.id, payload: payloadOf(job) });
    }

    const pending = await db.unifiedComparison.findMany({
      where: { status: 'PENDING_APPROVAL' },
    });
    expect(pending).toHaveLength(2);
  });
});
