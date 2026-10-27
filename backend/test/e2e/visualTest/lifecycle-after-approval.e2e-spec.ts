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
import { authRequest } from '../_support/utils/authenticated-request';

describe('Comparison lifecycle after approval (e2e)', () => {
  let app: INestApplication;
  let prisma: any;
  let storage: IStorageProvider;
  let cleanupService: OrphanCleanupService;

  const black = path.join(__dirname, 'fixtures', 'baseline_black.png');
  const blue = path.join(__dirname, 'fixtures', 'baseline_blue.png');

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
    await TestApp.createProject('checkout-ui');
  });

  afterAll(async () => {
    await TestApp.close();
  });

  function upload(file: string) {
    return authRequest(app)
      .post(uploadUrl)
      .field('viewport', '1920x1080')
      .field('browser', 'Chrome')
      .field('environment', 'staging')
      .attach('file', fs.createReadStream(file));
  }

  async function uploadAndApprove(): Promise<{ baselineUrl: string }> {
    await upload(black).expect(201);
    const mismatch = await upload(blue).expect(201);
    expect(mismatch.body.status).toBe(ComparisonOutcome.COMPARISON_QUEUED);
    const comparison = await waitForComparison(
      app,
      'checkout-ui',
      'login-form',
    );

    await authRequest(app)
      .post('/api/v1/projects/checkout-ui/tests/login-form/approval')
      .send({ comparisonId: comparison.body.comparison.id })
      .expect(201);

    const baseline = await prisma.unifiedScreenshot.findFirst({
      where: { type: 'BASELINE' },
    });
    return { baselineUrl: baseline.imageUrl };
  }

  it('answers the same variant status in the overview and in the persisted aggregate', async () => {
    await upload(black).expect(201);

    // Two encodings of one rule: the overview page derives the variant status
    // from an EXISTS over PENDING_APPROVAL, the persisted aggregate from the
    // latest-reviewable-comparison query. They may only ever answer the same
    // thing — that is what lets the overview page stay one statement.
    const readBoth = async () => {
      const overview = await authRequest(app)
        .get('/api/v1/projects/checkout-ui')
        .expect(200);
      const row = overview.body.visualTests.find(
        (candidate: { name: string }) => candidate.name === 'login-form',
      );
      const aggregate = await prisma.unifiedTest.findFirst({
        where: { name: 'login-form' },
        select: { status: true },
      });
      return {
        overview: row?.latestStatus as string,
        aggregate: aggregate?.status as string,
      };
    };

    const clean = await readBoth();
    expect(clean.overview).toBe(clean.aggregate);
    expect(clean.aggregate).toBe('UNCHANGED');

    await upload(blue).expect(201);
    await waitForComparison(app, 'checkout-ui', 'login-form');

    const pending = await readBoth();
    expect(pending.aggregate).toBe('PENDING_APPROVAL');
    expect(pending.overview).toBe(pending.aggregate);
  });

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
