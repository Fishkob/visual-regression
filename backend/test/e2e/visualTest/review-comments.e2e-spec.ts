import { INestApplication } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import request from 'supertest';
import { TestApp } from '../_support/utils/test-app';
import { authRequest } from '../_support/utils/authenticated-request';
import { PrismaConnection } from '@/prisma/prisma-connection';
import { PrismaClient } from '@/prisma/client';
import { hashPassword } from '@internal/auth/password-hasher';
import { waitForComparison } from '../_support/utils/wait-for-comparison';

describe('Review comments and decision reasons (e2e)', () => {
  let app: INestApplication;
  let db: PrismaClient;
  let cookie: string;
  const baseline = path.join(__dirname, 'fixtures', 'baseline_black.png');
  const mismatch = path.join(__dirname, 'fixtures', 'baseline_blue.png');

  beforeAll(async () => {
    app = await TestApp.init();
    db = app.get(PrismaConnection).client;
  });

  beforeEach(async () => {
    await TestApp.resetDb();
    await TestApp.createProject('shop');
    await db.user.create({
      data: {
        username: 'alice',
        passwordHash: await hashPassword('secret'),
        role: 'ADMIN',
      },
    });
    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ username: 'alice', password: 'secret' })
      .expect(200);
    cookie = login.get('Set-Cookie')![0].split(';')[0]!;
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

  it('threads, resolves and audits comments', async () => {
    await upload(baseline).expect(201);
    const created = await request(app.getHttpServer())
      .post('/api/v1/projects/shop/tests/login/comments')
      .set('Cookie', cookie)
      .send({ body: 'Is this the intended color?' })
      .expect(201);
    expect(created.body).toEqual(
      expect.objectContaining({
        author: 'alice',
        body: 'Is this the intended color?',
        resolvedAt: null,
      }),
    );

    const list = await request(app.getHttpServer())
      .get('/api/v1/projects/shop/tests/login/comments')
      .set('Cookie', cookie)
      .expect(200);
    expect(list.body).toHaveLength(1);

    const resolved = await request(app.getHttpServer())
      .patch(
        `/api/v1/projects/shop/tests/login/comments/${created.body.id}/resolve`,
      )
      .set('Cookie', cookie)
      .expect(200);
    expect(resolved.body.resolvedBy).toBe('alice');

    const audit = await request(app.getHttpServer())
      .get('/api/v1/audit?action=review.comment')
      .set('Cookie', cookie)
      .expect(200);
    expect(
      audit.body.data.some(
        (row: { action: string }) => row.action === 'review.comment',
      ),
    ).toBe(true);
  });

  it('stores a structured approval reason on the audit row', async () => {
    await upload(baseline).expect(201);
    await upload(mismatch).expect(201);
    const comparison = await waitForComparison(app, 'shop', 'login');
    await request(app.getHttpServer())
      .post('/api/v1/projects/shop/tests/login/approval')
      .set('Cookie', cookie)
      .send({
        comparisonId: comparison.body.comparison.id,
        reason: 'FLAKE',
        note: 'Flaky animation on the promo banner',
      })
      .expect(201);

    const approvals = await request(app.getHttpServer())
      .get('/api/v1/projects/shop/tests/login/approvals')
      .set('Cookie', cookie)
      .expect(200);
    expect(approvals.body[0]).toEqual(
      expect.objectContaining({
        reason: 'FLAKE',
        note: 'Flaky animation on the promo banner',
        approvedBy: 'alice',
      }),
    );

    const audit = await request(app.getHttpServer())
      .get('/api/v1/audit?action=approval')
      .set('Cookie', cookie)
      .expect(200);
    const approvalEvent = audit.body.data.find(
      (row: { action: string }) => row.action === 'approval',
    );
    expect(approvalEvent.metadata).toEqual(
      expect.objectContaining({
        reason: 'FLAKE',
        note: 'Flaky animation on the promo banner',
      }),
    );
  });

  it('returns the newest 200 comments oldest-first', async () => {
    await upload(baseline).expect(201);
    const test = await db.unifiedTest.findFirstOrThrow({
      where: { name: 'login' },
    });
    await db.reviewComment.createMany({
      data: Array.from({ length: 205 }, (_, index) => ({
        projectName: 'shop',
        testId: test.id,
        body: `comment ${String(index + 1)}`,
        author: 'alice',
        createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, index)),
      })),
    });

    const list = await request(app.getHttpServer())
      .get('/api/v1/projects/shop/tests/login/comments')
      .set('Cookie', cookie)
      .expect(200);

    expect(list.body).toHaveLength(200);
    expect(list.body[0].body).toBe('comment 6');
    expect(list.body[199].body).toBe('comment 205');
  });

  it('deletes the comments and votes of a deleted test in the same change', async () => {
    await upload(baseline).expect(201);
    const test = await db.unifiedTest.findFirstOrThrow({
      where: { name: 'login' },
    });
    await db.reviewComment.create({
      data: {
        projectName: 'shop',
        testId: test.id,
        body: 'Will this survive the delete?',
        author: 'alice',
      },
    });
    await db.approvalVote.create({
      data: {
        comparisonId: 'cmp-e2e',
        projectName: 'shop',
        testId: test.id,
        userId: 'user-alice',
        username: 'alice',
      },
    });

    await authRequest(app)
      .delete('/api/v1/projects/shop/tests/login')
      .expect(200);

    expect(await db.reviewComment.count({ where: { testId: test.id } })).toBe(
      0,
    );
    expect(await db.approvalVote.count({ where: { testId: test.id } })).toBe(0);
    expect(await db.unifiedTest.count({ where: { id: test.id } })).toBe(0);
  });
});
