import { INestApplication } from '@nestjs/common';
import { TestApp } from '../_support/utils/test-app';
import { waitForComparison } from '../_support/utils/wait-for-comparison';
import { PrismaConnection } from '@/prisma/prisma-connection';
import {
  ComparisonErrorCode,
  ComparisonOutcome,
} from '@public/visualTest/core/domain/types/visual-test.types';
import * as path from 'path';
import * as fs from 'fs';
import request from 'supertest';

describe('Threshold Update (e2e)', () => {
  let app: INestApplication;
  let prisma: any;

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

  it('should delete PENDING_APPROVAL comparison when new threshold is high enough', async () => {
    const baseline = path.join(
      __dirname,
      '../visualTest/fixtures/baseline_black.png',
    );
    const mismatch = path.join(
      __dirname,
      '../visualTest/fixtures/baseline_red.png',
    );

    await request(app.getHttpServer())
      .post(
        '/api/v1/projects/checkout-ui/tests/login-form/upload?testKind=image',
      )
      .field('viewport', '1920x1080')
      .field('browser', 'Chrome')
      .field('environment', 'staging')
      .attach('file', fs.createReadStream(baseline))
      .expect(201);

    const mismatchRes = await request(app.getHttpServer())
      .post(
        '/api/v1/projects/checkout-ui/tests/login-form/upload?testKind=image',
      )
      .field('viewport', '1920x1080')
      .field('browser', 'Chrome')
      .field('environment', 'staging')
      .attach('file', fs.createReadStream(mismatch))
      .expect(201);

    expect(mismatchRes.body.status).toBe(ComparisonOutcome.COMPARISON_QUEUED);
    expect(mismatchRes.body.error).toBe(ComparisonErrorCode.IMAGE_DIFFERENCE);

    const beforePatch = await waitForComparison(
      app,
      'checkout-ui',
      'login-form',
    );

    expect(beforePatch.body.comparison).toBeDefined();
    const mismatchPixelCount = beforePatch.body.comparison.mismatchPixelCount;
    expect(typeof mismatchPixelCount).toBe('number');

    await request(app.getHttpServer())
      .patch(
        '/api/v1/projects/checkout-ui/tests/login-form/threshold?viewport=1920x1080&browser=Chrome&environment=staging',
      )
      .send({ threshold: Number(mismatchPixelCount) + 1 })
      .expect(200);

    const afterPatch = await request(app.getHttpServer())
      .get(
        '/api/v1/projects/checkout-ui/tests/login-form?viewport=1920x1080&browser=Chrome&environment=staging',
      )
      .expect(200);

    expect(afterPatch.body.comparison).toBeUndefined();
  });

  it('should return 422 when threshold is below 0', async () => {
    await request(app.getHttpServer())
      .patch('/api/v1/projects/checkout-ui/tests/login-form/threshold')
      .send({ threshold: -1 })
      .expect(422);
  });

  it('should return 404 when project or test does not exist', async () => {
    await request(app.getHttpServer())
      .patch('/api/v1/projects/does-not-exist/tests/unknown/threshold')
      .send({ threshold: 10 })
      .expect(404);
  });
});
