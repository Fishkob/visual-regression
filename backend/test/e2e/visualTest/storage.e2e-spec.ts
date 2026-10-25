import { INestApplication } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { TestApp } from '../_support/utils/test-app';
import { authRequest } from '../_support/utils/authenticated-request';

describe('Storage visibility and quota (e2e)', () => {
  let app: INestApplication;
  const baseline = path.join(__dirname, 'fixtures', 'baseline_black.png');
  const mismatch = path.join(__dirname, 'fixtures', 'baseline_blue.png');

  beforeAll(async () => {
    app = await TestApp.init();
  });

  beforeEach(async () => {
    await TestApp.resetDb();
    await TestApp.createProject('shop');
  }, 30_000);

  afterAll(async () => {
    await TestApp.close();
  });

  function upload(file: string) {
    return authRequest(app)
      .post('/api/v1/projects/shop/tests/login/upload?testKind=image')
      .field('viewport', '1920x1080')
      .field('browser', 'Chrome')
      .field('environment', 'staging')
      .attach('file', fs.createReadStream(file));
  }

  it('reports usage and accepts retention settings', async () => {
    await upload(baseline).expect(201);

    const usage = await authRequest(app)
      .get('/api/v1/projects/shop/storage')
      .expect(200);
    expect(Number(usage.body.usageBytes)).toBeGreaterThan(0);
    expect(usage.body.fileCount).toBe(1);
    expect(usage.body.quotaBytes).toBeNull();

    const updated = await authRequest(app)
      .patch('/api/v1/projects/shop/storage')
      .send({
        baselineRevisionLimit: 3,
        runHistoryDays: 14,
        orphanGraceHours: 12,
        quotaSoftPercent: 70,
      })
      .expect(200);
    expect(updated.body).toEqual(
      expect.objectContaining({
        baselineRevisionLimit: 3,
        runHistoryDays: 14,
        orphanGraceHours: 12,
        softPercent: 70,
      }),
    );
  });

  it('rejects an upload above the hard quota with 413', async () => {
    await authRequest(app)
      .patch('/api/v1/projects/shop/storage')
      .send({ storageQuotaBytes: '1' })
      .expect(200);

    await upload(mismatch).expect(413);
  });
});
