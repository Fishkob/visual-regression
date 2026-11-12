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

  function upload(file: string, testName = 'login') {
    return authRequest(app)
      .post(`/api/v1/projects/shop/tests/${testName}/upload?testKind=image`)
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

  it('refuses a comment on a test the branch only inherits', async () => {
    await upload(baseline).expect(201);
    const mainBranch = await db.branch.findFirstOrThrow({
      where: { project: { name: 'shop' } },
    });
    // A branch that owns no test of its own: "login" is inherited from main.
    await db.branch.create({
      data: {
        projectId: mainBranch.projectId,
        name: 'feature/inherit',
        targetBranchId: mainBranch.id,
      },
    });

    await request(app.getHttpServer())
      .post('/api/v1/projects/shop/tests/login/comments')
      .set('Cookie', cookie)
      .send({
        body: 'Written from a branch that does not own the test',
        branch: 'feature/inherit',
      })
      .expect(409);

    const stored = await db.reviewComment.count();
    expect(stored).toBe(0);

    // Reading the inherited thread stays allowed.
    await request(app.getHttpServer())
      .get('/api/v1/projects/shop/tests/login/comments?branch=feature/inherit')
      .set('Cookie', cookie)
      .expect(200);
  });

  it('resolves a comment on the branch the thread belongs to', async () => {
    // The thread of a branch-owned test lives on that branch's test row, so a
    // resolve without the branch would look for the comment under the default
    // branch's test and answer 404. The route takes the branch for exactly this
    // reason; the caller (the panel) always has it.
    await upload(baseline, 'login')
      .field('branch', 'feature/resolve')
      .expect(201);
    const created = await request(app.getHttpServer())
      .post('/api/v1/projects/shop/tests/login/comments')
      .set('Cookie', cookie)
      .send({ body: 'Feature branch discussion', branch: 'feature/resolve' })
      .expect(201);

    await request(app.getHttpServer())
      .patch(
        `/api/v1/projects/shop/tests/login/comments/${created.body.id as string}/resolve?branch=feature/resolve`,
      )
      .set('Cookie', cookie)
      .expect(200);

    // The default branch only inherits that test; it does not own the comment.
    await request(app.getHttpServer())
      .patch(
        `/api/v1/projects/shop/tests/login/comments/${created.body.id as string}/resolve`,
      )
      .set('Cookie', cookie)
      .expect(404);
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

  it('pages past the default window with a cursor, without a gap or a repeat', async () => {
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

    const first = await request(app.getHttpServer())
      .get('/api/v1/projects/shop/tests/login/comments')
      .set('Cookie', cookie)
      .expect(200);

    // The cursor is the oldest comment of the page the caller holds.
    const older = await request(app.getHttpServer())
      .get(
        `/api/v1/projects/shop/tests/login/comments?before=${first.body[0].id as string}`,
      )
      .set('Cookie', cookie)
      .expect(200);

    expect(older.body.map((row: { body: string }) => row.body)).toEqual([
      'comment 1',
      'comment 2',
      'comment 3',
      'comment 4',
      'comment 5',
    ]);

    // Two pages chained through the cursor are a partition: every comment
    // exactly once, still oldest-first.
    const newestTwo = await request(app.getHttpServer())
      .get('/api/v1/projects/shop/tests/login/comments?limit=2')
      .set('Cookie', cookie)
      .expect(200);
    expect(newestTwo.body.map((row: { body: string }) => row.body)).toEqual([
      'comment 204',
      'comment 205',
    ]);

    const nextTwo = await request(app.getHttpServer())
      .get(
        `/api/v1/projects/shop/tests/login/comments?limit=2&before=${newestTwo.body[0].id as string}`,
      )
      .set('Cookie', cookie)
      .expect(200);
    expect(nextTwo.body.map((row: { body: string }) => row.body)).toEqual([
      'comment 202',
      'comment 203',
    ]);
  });

  it('rejects a cursor from another thread and a page outside the window', async () => {
    await upload(baseline).expect(201);
    await upload(baseline, 'signup').expect(201);
    const other = await db.unifiedTest.findFirstOrThrow({
      where: { name: 'signup' },
    });
    // A cursor anchors "older than this row in that thread". A row from another
    // test would start this page at a point this thread never reached, so it is
    // a 404 rather than a silent read.
    const foreign = await db.reviewComment.create({
      data: {
        projectName: 'shop',
        testId: other.id,
        body: 'Another thread',
        author: 'alice',
      },
    });

    await request(app.getHttpServer())
      .get(`/api/v1/projects/shop/tests/login/comments?before=${foreign.id}`)
      .set('Cookie', cookie)
      .expect(404);

    // The page size is a window, not a request for the whole thread: an
    // oversized page is refused (the shared validation pipe answers 422)
    // instead of being silently clamped.
    await request(app.getHttpServer())
      .get('/api/v1/projects/shop/tests/login/comments?limit=201')
      .set('Cookie', cookie)
      .expect(422);
  });

  it('deletes the comments of a deleted test', async () => {
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

    await authRequest(app)
      .delete('/api/v1/projects/shop/tests/login')
      .expect(200);

    expect(await db.reviewComment.count({ where: { testId: test.id } })).toBe(
      0,
    );
    expect(await db.unifiedTest.count({ where: { id: test.id } })).toBe(0);
  });

  it('deletes the project-scoped comments when the project is deleted', async () => {
    await upload(baseline).expect(201);
    const test = await db.unifiedTest.findFirstOrThrow({
      where: { name: 'login' },
    });
    await db.reviewComment.create({
      data: {
        projectName: 'shop',
        testId: test.id,
        body: 'Deleted with the project',
        author: 'alice',
      },
    });

    await authRequest(app).delete('/api/v1/projects/shop').expect(200);

    // Comments carry the project name denormalized and have no foreign key to
    // the test, so nothing cascades them away: the delete path has to reach
    // them by name.
    expect(
      await db.reviewComment.count({ where: { projectName: 'shop' } }),
    ).toBe(0);
  });
});
