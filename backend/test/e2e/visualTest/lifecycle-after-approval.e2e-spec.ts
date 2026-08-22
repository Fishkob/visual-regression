import { INestApplication } from '@nestjs/common';
import { TestApp } from '../_support/utils/test-app';
import { waitForComparison } from '../_support/utils/wait-for-comparison';
import { PrismaConnection } from '@/prisma/prisma-connection';
import { OrphanCleanupService } from '@internal/data-deletion/services/orphan-cleanup.service';
import {
  STORAGE_PROVIDER,
  IStorageProvider,
} from '@common/domain/storage-provider.interface';
import {
  ComparisonErrorCode,
  ComparisonOutcome,
} from '@public/visualTest/core/domain/types/visual-test.types';
import * as path from 'path';
import * as fs from 'fs';
import request from 'supertest';

describe('Comparison lifecycle after approval (e2e)', () => {
  let app: INestApplication;
  let prisma: any;
  let storage: IStorageProvider;
  let cleanupService: OrphanCleanupService;

  const black = path.join(__dirname, 'fixtures', 'baseline_black.png');
  const red = path.join(__dirname, 'fixtures', 'baseline_red.png');

  const uploadUrl =
    '/api/v1/projects/checkout-ui/tests/login-form/upload?testKind=image';

  beforeAll(async () => {
    app = await TestApp.init();
    prisma = app.get(PrismaConnection).client;
    storage = app.get(STORAGE_PROVIDER);
    cleanupService = app.get(OrphanCleanupService);
  });

  beforeEach(async () => {
    await TestApp.resetDb();
    await prisma.project.create({ data: { name: 'checkout-ui' } });
  });

  afterAll(async () => {
    await TestApp.close();
  });

  function upload(file: string) {
    return request(app.getHttpServer())
      .post(uploadUrl)
      .field('viewport', '1920x1080')
      .field('browser', 'Chrome')
      .field('environment', 'staging')
      .attach('file', fs.createReadStream(file));
  }

  async function uploadAndApprove(): Promise<{ baselineUrl: string }> {
    await upload(black).expect(201);
    const mismatch = await upload(red).expect(201);
    expect(mismatch.body.status).toBe(ComparisonOutcome.COMPARISON_QUEUED);
    const comparison = await waitForComparison(
      app,
      'checkout-ui',
      'login-form',
    );

    await request(app.getHttpServer())
      .post('/api/v1/projects/checkout-ui/tests/login-form/approval')
      .send({ comparisonId: comparison.body.comparison.id })
      .expect(201);

    const baseline = await prisma.unifiedScreenshot.findFirst({
      where: { type: 'BASELINE' },
    });
    return { baselineUrl: baseline.imageUrl };
  }

  it('re-uploads a different image after approval and still gets a reviewable comparison', async () => {
    await uploadAndApprove();

    // A newer, different image must be queued and turned into a comparison —
    // the supersede check must not misfire on a stale CURRENT row.
    const requeue = await upload(black).expect(201);
    expect(requeue.body.status).toBe(ComparisonOutcome.COMPARISON_QUEUED);

    const res = await waitForComparison(app, 'checkout-ui', 'login-form');
    expect(res.body.comparison.status).toBe('PENDING_APPROVAL');
  });

  it('orphan cleanup keeps the approved baseline storage object and its row', async () => {
    const { baselineUrl } = await uploadAndApprove();

    // Approval must remove the CURRENT row instead of leaving it behind.
    const remainingCurrent = await prisma.unifiedScreenshot.count({
      where: { type: 'CURRENT' },
    });
    expect(remainingCurrent).toBe(0);

    await cleanupService.execute();

    const baselineStillExists = await storage.exists(baselineUrl);
    expect(baselineStillExists).toBe(true);

    const baselineRow = await prisma.unifiedScreenshot.findFirst({
      where: { type: 'BASELINE' },
    });
    expect(baselineRow.imageUrl).toBe(baselineUrl);
  });
});
