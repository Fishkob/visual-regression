import { INestApplication } from '@nestjs/common';
import { TestApp } from '../_support/utils/test-app';
import { waitForComparison } from '../_support/utils/wait-for-comparison';
import { PrismaConnection } from '@/prisma/prisma-connection';
import { TestStatus } from '@/prisma/client';
import type { PrismaClient } from '@/prisma/client';
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
  let prisma: PrismaClient;
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

  const fixture = (name: string) =>
    fs.createReadStream(path.join(__dirname, 'fixtures', name));

  function upload(branch: string | undefined, filename: string) {
    const req = authRequest(app).post(
      '/api/v1/projects/checkout-ui/tests/login-form/upload?testKind=image',
    );
    if (branch) req.field('branch', branch);
    return req
      .field('viewport', '1920x1080')
      .field('browser', 'Chrome')
      .field('environment', 'staging')
      .attach('file', fixture(filename));
  }

  function approve(comparisonId: string, branch?: string) {
    const req = authRequest(app).post(
      '/api/v1/projects/checkout-ui/tests/login-form/approval',
    );
    if (branch) req.query({ branch });
    return req.send({ comparisonId });
  }

  function approvals(branch?: string) {
    const req = authRequest(app).get(
      '/api/v1/projects/checkout-ui/tests/login-form/approvals',
    );
    if (branch) req.query({ branch });
    return req;
  }

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

  it('should expose the approval in the audit trail with the authenticated caller', async () => {
    await upload(undefined, 'baseline_black.png').expect(201);
    const mismatch = await upload(undefined, 'baseline_blue.png').expect(201);
    expect(mismatch.body.status).toBe(ComparisonOutcome.COMPARISON_QUEUED);

    const pending = await waitForComparison(app, 'checkout-ui', 'login-form');
    const comparisonId = pending.body.comparison.id;
    const candidateHash = pending.body.comparison.candidate.imageHash;
    const baselineHash = pending.body.baseline.imageHash;

    await approve(comparisonId).expect(201);

    const history = await approvals().expect(200);

    expect(history.body).toHaveLength(1);
    expect(history.body[0]).toMatchObject({
      approvedBy: 'e2e',
      comparisonId,
      testKind: 'image',
      branchName: null,
      variant: {
        viewport: '1920x1080',
        browser: 'Chrome',
        environment: 'staging',
      },
      candidateHash,
      baselineHash,
      mismatchPixelCount: pending.body.comparison.mismatchPixelCount,
    });
    expect(typeof history.body[0].id).toBe('string');
    expect(typeof history.body[0].approvedAt).toBe('string');
  });

  it('should filter the approval trail by branch', async () => {
    await upload(undefined, 'baseline_black.png').expect(201);
    const mainPendingUpload = await upload(
      undefined,
      'baseline_blue.png',
    ).expect(201);
    expect(mainPendingUpload.body.status).toBe(
      ComparisonOutcome.COMPARISON_QUEUED,
    );
    // The feature branch inherits the main baseline, so the same blue upload is
    // a mismatch there too — and pins its own baseline on approval.
    const featurePendingUpload = await upload(
      'feature/x',
      'baseline_blue.png',
    ).expect(201);
    expect(featurePendingUpload.body.status).toBe(
      ComparisonOutcome.COMPARISON_QUEUED,
    );

    const filters = {
      viewport: '1920x1080',
      browser: 'Chrome',
      environment: 'staging',
    };
    const mainPending = await waitForComparison(
      app,
      'checkout-ui',
      'login-form',
      filters,
      'main',
    );
    const featurePending = await waitForComparison(
      app,
      'checkout-ui',
      'login-form',
      filters,
      'feature/x',
    );

    await approve(mainPending.body.comparison.id, 'main').expect(201);
    await approve(featurePending.body.comparison.id, 'feature/x').expect(201);

    const mainHistory = await approvals('main').expect(200);
    expect(mainHistory.body).toHaveLength(1);
    expect(mainHistory.body[0]).toMatchObject({
      branchName: 'main',
      comparisonId: mainPending.body.comparison.id,
    });

    const featureHistory = await approvals('feature/x').expect(200);
    expect(featureHistory.body).toHaveLength(1);
    expect(featureHistory.body[0]).toMatchObject({
      branchName: 'feature/x',
      comparisonId: featurePending.body.comparison.id,
    });

    const unfiltered = await approvals().expect(200);
    expect(
      unfiltered.body.map((row: { branchName: string }) => row.branchName),
    ).toEqual(['feature/x', 'main']);
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
