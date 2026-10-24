import { INestApplication } from '@nestjs/common';
import { TestApp } from '../_support/utils/test-app';
import { waitForComparison } from '../_support/utils/wait-for-comparison';
import { PrismaConnection } from '@/prisma/prisma-connection';
import { TestStatus } from '@/prisma/client';
import {
  ComparisonErrorCode,
  ComparisonOutcome,
} from '@public/visualTest/core/domain/types/visual-test.types';
import * as path from 'path';
import * as fs from 'fs';
import { authRequest } from '../_support/utils/authenticated-request';
import { AppConfigService } from '@config/app-config.service';

describe('Approve Visual Test (e2e)', () => {
  let app: INestApplication;
  let prisma: any;
  let storagePrefix: string;

  beforeAll(async () => {
    app = await TestApp.init();
    prisma = app.get(PrismaConnection).client;
    // The bucket is configuration: derive the expected object URL from the app
    // config instead of hardcoding (or loosening) the bucket name.
    const config = app.get(AppConfigService);
    storagePrefix = `${config.rustfs.publicUrl}/${config.rustfs.bucket}/`;
  });

  beforeEach(async () => {
    await TestApp.resetDb();
    await TestApp.createProject('checkout-ui');
  });

  afterAll(async () => {
    await TestApp.close();
  });

  it('should create a baseline, trigger a comparison, and keep it pending for approval', async () => {
    const baseline = path.join(__dirname, 'fixtures', 'baseline_black.png');
    const mismatch = path.join(__dirname, 'fixtures', 'baseline_blue.png');

    // 1. Upload the baseline image
    await authRequest(app)
      .post(
        '/api/v1/projects/checkout-ui/tests/login-form/upload?testKind=image',
      )
      .field('viewport', '1920x1080')
      .field('browser', 'Chrome')
      .field('environment', 'staging')
      .attach('file', fs.createReadStream(baseline))
      .expect(201);

    // 2. Upload a mismatched image → returns 201 with DIFFERENT status
    const mismatchRes = await authRequest(app)
      .post(
        '/api/v1/projects/checkout-ui/tests/login-form/upload?testKind=image',
      )
      .field('viewport', '1920x1080')
      .field('browser', 'Chrome')
      .field('environment', 'staging')
      .attach('file', fs.createReadStream(mismatch))
      .expect(201);

    expect(mismatchRes.body.error).toBe(ComparisonErrorCode.IMAGE_DIFFERENCE);
    expect(mismatchRes.body.status).toBe(ComparisonOutcome.COMPARISON_QUEUED);

    // 3. Wait for comparison to be processed, then verify details
    const res = await waitForComparison(app, 'checkout-ui', 'login-form');

    // Expected behavior:
    // - The comparison remains in PENDING_APPROVAL
    // - The baseline exists
    // - The candidate image was stored
    expect(res.body).toHaveProperty('comparison');
    expect(res.body.comparison.status).toBe('PENDING_APPROVAL');

    expect(res.body.comparison.candidate).toBeDefined();
    expect(res.body.comparison.candidate.imageUrl).toContain(storagePrefix);
    expect(res.body.comparison.candidate.imageUrl).toMatch(/\.png$/);

    expect(res.body.baseline).toBeDefined();
    expect(res.body.baseline.imageUrl).toContain(storagePrefix);
    expect(res.body.baseline.imageUrl).toMatch(/\.png$/);
  });

  it('should approve the latest comparison and detect the same diff image as a match afterwards', async () => {
    const baseline = path.join(__dirname, 'fixtures', 'baseline_black.png');
    const mismatch = path.join(__dirname, 'fixtures', 'baseline_blue.png');

    // 1. Upload baseline
    await authRequest(app)
      .post(
        '/api/v1/projects/checkout-ui/tests/login-form/upload?testKind=image',
      )
      .field('viewport', '1920x1080')
      .field('browser', 'Chrome')
      .field('environment', 'staging')
      .attach('file', fs.createReadStream(baseline))
      .expect(201);

    // 2. Upload mismatch → returns 201 with DIFFERENT status
    const mismatchRes = await authRequest(app)
      .post(
        '/api/v1/projects/checkout-ui/tests/login-form/upload?testKind=image',
      )
      .field('viewport', '1920x1080')
      .field('browser', 'Chrome')
      .field('environment', 'staging')
      .attach('file', fs.createReadStream(mismatch))
      .expect(201);

    expect(mismatchRes.body.error).toBe(ComparisonErrorCode.IMAGE_DIFFERENCE);
    expect(mismatchRes.body.status).toBe(ComparisonOutcome.COMPARISON_QUEUED);

    // 3. Wait for the poller to process the comparison, then approve
    const comparison = await waitForComparison(
      app,
      'checkout-ui',
      'login-form',
    );

    // 4. Approve the pinned comparison
    const approveRes = await authRequest(app)
      .post('/api/v1/projects/checkout-ui/tests/login-form/approval')
      .send({ comparisonId: comparison.body.comparison.id })
      .expect(201);

    expect(approveRes.body.approved).toBe(true);
    expect(approveRes.body.newBaselineUrl).toContain(storagePrefix);

    // 4. Upload the same mismatched image again → should now be a match
    const repeatUpload = await authRequest(app)
      .post(
        '/api/v1/projects/checkout-ui/tests/login-form/upload?testKind=image',
      )
      .field('viewport', '1920x1080')
      .field('browser', 'Chrome')
      .field('environment', 'staging')
      .attach('file', fs.createReadStream(mismatch))
      .expect(201);

    expect(repeatUpload.body.mismatchPixelCount).toBe(0);
  });

  it('should return 404 when approving a test without any comparisons', async () => {
    const { branchId } = await TestApp.createProject('p-no-comp');
    await prisma.unifiedTest.create({
      data: {
        name: 'NoCompTest',
        kind: 'image',
        status: TestStatus.PENDING,
        branchId,
      },
    });

    await authRequest(app)
      .post('/api/v1/projects/p-no-comp/tests/NoCompTest/approval')
      .send({ comparisonId: 'no-such-comparison' })
      .expect(404);
  });
});
