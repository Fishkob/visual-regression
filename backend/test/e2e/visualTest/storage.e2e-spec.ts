import { INestApplication } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import request from 'supertest';
import { hashPassword } from '@internal/auth/password-hasher';
import { PrismaConnection } from '@/prisma/prisma-connection';
import type { PrismaClient } from '@/prisma/client';
import { TestApp } from '../_support/utils/test-app';
import { authRequest } from '../_support/utils/authenticated-request';

describe('Storage visibility and quota (e2e)', () => {
  let app: INestApplication;
  let db: PrismaClient;
  let adminCookie: string;
  const baseline = path.join(__dirname, 'fixtures', 'baseline_black.png');
  const mismatch = path.join(__dirname, 'fixtures', 'baseline_blue.png');

  beforeAll(async () => {
    app = await TestApp.init();
    db = app.get(PrismaConnection).client;
  });

  beforeEach(async () => {
    await TestApp.resetDb();
    await TestApp.createProject('shop');
    // Retention is an ADMIN surface: the settings patches ride a session, the
    // uploads keep using the e2e API key (which acts as a MEMBER).
    await db.user.create({
      data: {
        username: 'storage-admin',
        passwordHash: await hashPassword('secret'),
        role: 'ADMIN',
      },
    });
    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ username: 'storage-admin', password: 'secret' })
      .expect(200);
    adminCookie = login.get('Set-Cookie')![0].split(';')[0]!;
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

    const updated = await request(app.getHttpServer())
      .patch('/api/v1/projects/shop/storage')
      .set('Cookie', adminCookie)
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

    const preview = await authRequest(app)
      .get('/api/v1/projects/shop/storage/preview')
      .expect(200);
    expect(preview.body).toEqual(
      expect.objectContaining({
        baselineRevisions: { limit: 3, overflow: 0 },
        runs: { days: 14, eligible: 0 },
        orphanGraceHours: 12,
      }),
    );
  });

  it('rejects an upload above the hard quota with 413', async () => {
    await request(app.getHttpServer())
      .patch('/api/v1/projects/shop/storage')
      .set('Cookie', adminCookie)
      .send({ storageQuotaBytes: '1' })
      .expect(200);

    await upload(mismatch).expect(413);
  });
});
