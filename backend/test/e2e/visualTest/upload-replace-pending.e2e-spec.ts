import { INestApplication } from '@nestjs/common';
import { TestApp } from '../_support/utils/test-app';
import { waitForComparison } from '../_support/utils/wait-for-comparison';
import {
  ComparisonErrorCode,
  ComparisonOutcome,
} from '@public/visualTest/core/domain/types/visual-test.types';
import * as path from 'path';
import * as fs from 'fs';
import { authRequest } from '../_support/utils/authenticated-request';

describe('Upload Replace Pending (e2e)', () => {
  let app: INestApplication;

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

  it('should replace an existing PENDING_APPROVAL comparison with a new mismatch', async () => {
    const baseline = path.join(__dirname, 'fixtures', 'baseline_black.png');
    const mismatch1 = path.join(__dirname, 'fixtures', 'baseline_blue.png');
    const mismatch2 = path.join(__dirname, 'fixtures', 'baseline_blue.png');

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

    // 2. Upload first mismatch → returns 201 with DIFFERENT status
    const res1 = await authRequest(app)
      .post(
        '/api/v1/projects/checkout-ui/tests/login-form/upload?testKind=image',
      )
      .field('viewport', '1920x1080')
      .field('browser', 'Chrome')
      .field('environment', 'staging')
      .attach('file', fs.createReadStream(mismatch1))
      .expect(201);

    expect(res1.body.status).toBe(ComparisonOutcome.COMPARISON_QUEUED);
    expect(res1.body.error).toBe(ComparisonErrorCode.IMAGE_DIFFERENCE);

    // 3. Upload second mismatch → replaces existing pending comparison
    const res2 = await authRequest(app)
      .post(
        '/api/v1/projects/checkout-ui/tests/login-form/upload?testKind=image',
      )
      .field('viewport', '1920x1080')
      .field('browser', 'Chrome')
      .field('environment', 'staging')
      .attach('file', fs.createReadStream(mismatch2))
      .expect(201);

    expect(res2.body.status).toBe(ComparisonOutcome.COMPARISON_QUEUED);
    expect(res2.body.error).toBe(ComparisonErrorCode.IMAGE_DIFFERENCE);

    // 4. Wait for the poller to process, then verify details
    const details = await waitForComparison(app, 'checkout-ui', 'login-form');

    expect(details.body).toEqual({
      name: 'login-form',
      origin: 'branch',
      inheritedFrom: null,
      baselineInherited: false,
      inheritTarget: null,
      baseline: expect.objectContaining({
        imageUrl: expect.any(String),
        variant: {
          viewport: '1920x1080',
          browser: 'Chrome',
          environment: 'staging',
        },
        pixelDiffThreshold: expect.any(Number),
        createdAt: expect.any(String),
      }),
      comparison: expect.objectContaining({
        id: expect.any(String),
        createdAt: expect.any(String),
        diffImageUrl: expect.any(String),
        mismatchPixelCount: expect.any(Number),
        status: expect.stringMatching(/PENDING_APPROVAL|APPROVED|UNCHANGED/),
        baseline: expect.objectContaining({
          pixelDiffThreshold: expect.any(Number),
        }),
        candidate: expect.objectContaining({
          imageUrl: expect.any(String),
        }),
      }),
    });

    // 5. Upload the same baseline image again → should result in a match
    const res3 = await authRequest(app)
      .post(
        '/api/v1/projects/checkout-ui/tests/login-form/upload?testKind=image',
      )
      .field('viewport', '1920x1080')
      .field('browser', 'Chrome')
      .field('environment', 'staging')
      .attach('file', fs.createReadStream(baseline))
      .expect(201);

    expect(res3.body).toEqual({
      status: ComparisonOutcome.IDENTICAL,
      mismatchPixelCount: 0,
      branch: 'main',
    });
  });
});
