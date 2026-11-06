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

  function upload(file: string, branch?: string) {
    const request = authRequest(app).post(
      '/api/v1/projects/shop/tests/login/upload?testKind=image',
    );
    if (branch) request.field('branch', branch);
    return request
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
        branchRetentionDays: 30,
        orphanGraceHours: 12,
        quotaSoftPercent: 70,
      })
      .expect(200);
    expect(updated.body).toEqual(
      expect.objectContaining({
        baselineRevisionLimit: 3,
        runHistoryDays: 14,
        branchRetentionDays: 30,
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
        branches: { days: 30, eligible: 0 },
        effectiveOrphanGraceHours: 12,
      }),
    );
  });

  // The dry run and the nightly sweep read one predicate (ADR-067). This case
  // proves the predicate against real SQL: a fresh branch is not a candidate, an
  // idle one is, and archiving it — the reversible "keep this" — shields it.
  it('counts only idle, unarchived, non-default branches as cleanup candidates', async () => {
    await upload(baseline, 'feature/old').expect(201);
    await request(app.getHttpServer())
      .patch('/api/v1/projects/shop/storage')
      .set('Cookie', adminCookie)
      .send({ branchRetentionDays: 30 })
      .expect(200);

    // The upload wrote the branch's activity clock (the sweep's only signal),
    // so a fresh branch is never a candidate.
    const created = await db.branch.findFirstOrThrow({
      where: { name: 'feature/old' },
    });
    expect(Date.now() - created.lastActivityAt.getTime()).toBeLessThan(60_000);

    const fresh = await authRequest(app)
      .get('/api/v1/projects/shop/storage/preview')
      .expect(200);
    expect(fresh.body.branches).toEqual({ days: 30, eligible: 0 });

    const idle = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
    await db.branch.updateMany({
      where: { name: 'feature/old' },
      data: { createdAt: idle, lastActivityAt: idle },
    });

    const past = await authRequest(app)
      .get('/api/v1/projects/shop/storage/preview')
      .expect(200);
    expect(past.body.branches).toEqual({ days: 30, eligible: 1 });

    await request(app.getHttpServer())
      .patch('/api/v1/projects/shop/branches?branch=feature%2Fold')
      .set('Cookie', adminCookie)
      .send({ isArchived: true })
      .expect(200);

    const archived = await authRequest(app)
      .get('/api/v1/projects/shop/storage/preview')
      .expect(200);
    expect(archived.body.branches).toEqual({ days: 30, eligible: 0 });
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
