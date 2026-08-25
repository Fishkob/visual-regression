import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaConnection } from '@/prisma/prisma-connection';
import { TestApp } from '../_support/utils/test-app';
import { authRequest } from '../_support/utils/authenticated-request';

describe('Upload rate limit (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await TestApp.init();
    // ConfigModule.forRoot({ cache: true, validationSchema }) captures the env
    // at module-import time (UPLOAD_RATE_LIMIT_PER_MINUTE='0' disables the limit
    // for the rest of the e2e suite), so the per-file override must go through
    // ConfigService.set() which wins over the validated env at read time.
    app.get(ConfigService).set('UPLOAD_RATE_LIMIT_PER_MINUTE', '5');
    await TestApp.resetDb();
    const db = app.get(PrismaConnection).client;
    await db.project.create({ data: { name: 'rate-limit-proj' } });
  });

  afterAll(async () => {
    app.get(ConfigService).set('UPLOAD_RATE_LIMIT_PER_MINUTE', '0');
    await TestApp.close();
  });

  it('rejects the 6th upload in a minute window with 429 and Retry-After', async () => {
    const filePath = path.join(__dirname, 'fixtures', 'baseline_black.png');
    const fileBuffer = fs.readFileSync(filePath);

    for (let i = 1; i <= 5; i++) {
      const res = await authRequest(app)
        .post(
          `/api/v1/projects/rate-limit-proj/tests/rl-${i}/upload?testKind=image`,
        )
        .field('viewport', '1280x720')
        .field('browser', 'Chrome')
        .field('environment', 'staging')
        .attach('file', fileBuffer, {
          filename: 'baseline_black.png',
          contentType: 'image/png',
        });
      expect(res.status).toBe(201);
    }

    const over = await authRequest(app)
      .post('/api/v1/projects/rate-limit-proj/tests/rl-6/upload?testKind=image')
      .field('viewport', '1280x720')
      .field('browser', 'Chrome')
      .field('environment', 'staging')
      .attach('file', fileBuffer, {
        filename: 'baseline_black.png',
        contentType: 'image/png',
      });

    expect(over.status).toBe(429);
    expect(Number(over.headers['retry-after'])).toBeGreaterThan(0);
  });
});
