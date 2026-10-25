import { INestApplication } from '@nestjs/common';
import { TestApp } from '../_support/utils/test-app';
import { waitForComparison } from '../_support/utils/wait-for-comparison';
import { PrismaConnection } from '@/prisma/prisma-connection';
import { ScreenshotType } from '@/prisma/client';
import {
  ComparisonErrorCode,
  ComparisonOutcome,
} from '@public/visualTest/core/domain/types/visual-test.types';
import * as path from 'path';
import * as fs from 'fs';
import { authRequest } from '../_support/utils/authenticated-request';

describe('Upload Mismatch (e2e)', () => {
  let app: INestApplication;
  let prisma: any;

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

  it('should detect mismatch and return ConflictException with comparison detail', async () => {
    const baseline = path.join(__dirname, 'fixtures', 'baseline_black.png');
    const mismatch = path.join(__dirname, 'fixtures', 'baseline_blue.png');

    // 1. Upload Baseline
    await authRequest(app)
      .post(
        '/api/v1/projects/checkout-ui/tests/login-form/upload?testKind=image',
      )
      .field('viewport', '1920x1080')
      .field('browser', 'Chrome')
      .field('environment', 'staging')
      .attach('file', fs.createReadStream(baseline))
      .expect(201);

    // 2. Upload Mismatch (returns 201 with different status)
    const res = await authRequest(app)
      .post(
        '/api/v1/projects/checkout-ui/tests/login-form/upload?testKind=image',
      )
      .field('viewport', '1920x1080')
      .field('browser', 'Chrome')
      .field('environment', 'staging')
      .attach('file', fs.createReadStream(mismatch))
      .expect(201);

    expect(res.body.status).toBe(ComparisonOutcome.COMPARISON_QUEUED);
    expect(res.body.error).toBe(ComparisonErrorCode.IMAGE_DIFFERENCE);

    // 3. Wait for comparison to be processed by the poller, then GET details
    const details = await waitForComparison(app, 'checkout-ui', 'login-form');

    expect(details.body).toEqual({
      name: 'login-form',
      origin: 'branch',
      inheritedFrom: null,
      baselineInherited: false,
      inheritTarget: null,
      baseline: {
        imageUrl: expect.any(String),
        // Presigned variant of the same object; only its shape is asserted
        // because the signature is time-bound.
        signedImageUrl: expect.any(String),
        id: expect.any(String),
        imageHash: expect.any(String),
        variant: {
          viewport: '1920x1080',
          browser: 'Chrome',
          environment: 'staging',
        },
        pixelDiffThreshold: expect.any(Number),
        type: ScreenshotType.BASELINE,
        createdAt: expect.any(String),
        visualTestId: expect.any(String),
      },
      comparison: {
        id: expect.any(String),
        createdAt: expect.any(String),
        diffImageUrl: expect.any(String),
        // Presigned variant of the same object. The signature is time-bound, so
        // only its shape is asserted.
        signedDiffImageUrl: expect.any(String),
        mismatchPixelCount: expect.any(Number),
        status: expect.stringMatching(/PENDING_APPROVAL|APPROVED|UNCHANGED/),
        thresholdExceeded: expect.any(Boolean),
        baseline: expect.objectContaining({
          pixelDiffThreshold: expect.any(Number),
        }),
        candidate: expect.objectContaining({
          imageUrl: expect.any(String),
        }),
      },
    });
  });
});
