import { INestApplication } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { TestApp } from '../_support/utils/test-app';
import { authRequest } from '../_support/utils/authenticated-request';
import { PrismaConnection } from '@/prisma/prisma-connection';
import type { PrismaClient } from '@/prisma/client';
import { ComparisonJobProcessor } from '@public/visualTest/intake/workers/comparison-job-processor';
import { AppConfigService } from '@config/app-config.service';
import { hashPassword } from '@internal/auth/password-hasher';
import request from 'supertest';
import { Client } from 'pg';
import { ComparisonJobPoller } from '@public/visualTest/intake/workers/comparison-job-poller';

// Two requests that arrive at the same time are the one thing a mocked
// repository can never simulate: the duplicate check, the unique index and the
// retirement of a superseded comparison are decided by Postgres. These cases
// pin the invariants AGENTS.md promises ("at most one reviewable comparison per
// variant", a status that is recomputed transactionally, an approval that
// finalizes once) to the database instead of to a stub.
describe('Concurrent review paths (e2e)', () => {
  let app: INestApplication;
  let db: PrismaClient;

  const fixture = (name: string) =>
    fs.createReadStream(path.join(__dirname, 'fixtures', name));

  function upload(filename: string) {
    return authRequest(app)
      .post('/api/v1/projects/shop/tests/login/upload?testKind=image')
      .field('viewport', '1920x1080')
      .field('browser', 'Chrome')
      .field('environment', 'staging')
      .attach('file', fixture(filename));
  }

  async function login(username: string): Promise<string> {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ username, password: 'secret' })
      .expect(200);
    return response.get('Set-Cookie')![0].split(';')[0]!;
  }

  function approve(comparisonId: string) {
    return authRequest(app)
      .post('/api/v1/projects/shop/tests/login/approval')
      .send({ comparisonId });
  }

  function voteAs(cookie: string, comparisonId: string) {
    return request(app.getHttpServer())
      .post('/api/v1/projects/shop/tests/login/approval')
      .set('Cookie', cookie)
      .send({ comparisonId });
  }

  async function waitUntil(
    predicate: () => Promise<boolean> | boolean,
    timeoutMs: number,
  ): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (await predicate()) return;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  }

  /** Run every queued comparison job in creation order, like the poller. */
  async function drainJobs(): Promise<void> {
    const processor = app.get(ComparisonJobProcessor);
    const jobs = await db.comparisonJob.findMany({
      where: { status: 'PENDING' },
      orderBy: { createdAt: 'asc' },
    });
    for (const job of jobs) {
      await processor.processJob({ id: job.id, payload: job.payload as never });
    }
  }

  beforeAll(async () => {
    app = await TestApp.init();
    db = app.get(PrismaConnection).client;
    // This spec processes queued jobs itself (drainJobs). The worker module's
    // poller rides along in the e2e app and would claim the same jobs: a diff
    // job that finished while two reviewers were voting retired the comparison
    // they were voting on, which is how this file flaked in CI and nowhere
    // locally. Nothing else in this file needs background processing.
    app.get(ComparisonJobPoller).stop();
  });

  beforeEach(async () => {
    await TestApp.resetDb();
    await TestApp.createProject('shop');
  });

  afterAll(async () => {
    await TestApp.close();
  });

  it('accepts two uploads of one variant at the same time and keeps one comparison', async () => {
    await upload('baseline_black.png').expect(201);

    const responses = await Promise.all([
      upload('baseline_blue.png'),
      upload('baseline_red.png'),
    ]);

    // A lost update race on the (testId, variantId, type) unique index must not
    // surface as a 500 to the client.
    expect(responses.map((response) => response.status)).toEqual([201, 201]);

    await drainJobs();

    expect(await db.unifiedVariant.count()).toBe(1);
    expect(
      await db.unifiedScreenshot.count({ where: { type: 'CURRENT' } }),
    ).toBe(1);

    const reviewable = await db.unifiedComparison.findMany({
      where: { status: 'PENDING_APPROVAL' },
    });
    expect(reviewable).toHaveLength(1);

    // The surviving comparison must still point at a candidate row that exists:
    // the guarded delete may not reclaim a candidate a comparison references.
    const candidateId = reviewable[0]!.candidateId;
    expect(candidateId).not.toBeNull();
    expect(
      await db.unifiedScreenshot.findUnique({ where: { id: candidateId! } }),
    ).not.toBeNull();

    // Its diff object was uploaded, so the review page can actually render it.
    const config = app.get(AppConfigService);
    expect(reviewable[0]!.diffImageUrl).toContain(
      `${config.rustfs.publicUrl}/${config.rustfs.bucket}/`,
    );
  });

  it('finalizes a concurrent approval pair exactly once', async () => {
    await upload('baseline_black.png').expect(201);
    await upload('baseline_blue.png').expect(201);
    await drainJobs();

    const comparison = await db.unifiedComparison.findFirstOrThrow({
      where: { status: 'PENDING_APPROVAL' },
    });

    const results = await Promise.all([
      approve(comparison.id),
      approve(comparison.id),
    ]);
    const statuses = results.map((result) => result.status).sort();

    // Exactly one request finalizes. The loser finds the review target already
    // approved — and therefore gone, because approving an image comparison
    // deletes the row — which the API answers with 404. It must not create a
    // second approval, a second audit row, or a second baseline revision.
    expect(statuses).toEqual([201, 404]);

    expect(
      await db.unifiedComparison.findUnique({ where: { id: comparison.id } }),
    ).toBeNull();
    expect(
      await db.approval.count({ where: { comparisonId: comparison.id } }),
    ).toBe(1);
    expect(
      await db.auditEvent.count({
        where: { action: 'approval', targetId: comparison.testId },
      }),
    ).toBe(1);
    expect(
      await db.unifiedTest.findFirstOrThrow({ where: { name: 'login' } }),
    ).toEqual(expect.objectContaining({ status: 'UNCHANGED' }));
  });

  it('finalizes a 4-eyes gate when the two reviewers vote at the same time', async () => {
    await db.user.createMany({
      data: [
        { username: 'alice', passwordHash: await hashPassword('secret') },
        { username: 'bob', passwordHash: await hashPassword('secret') },
      ],
    });
    await db.project.update({
      where: { name: 'shop' },
      data: { requiredApprovals: 2 },
    });

    await upload('baseline_black.png').expect(201);
    await upload('baseline_blue.png').expect(201);
    await drainJobs();

    const comparison = await db.unifiedComparison.findFirstOrThrow({
      where: { status: 'PENDING_APPROVAL' },
    });
    const [aliceCookie, bobCookie] = await Promise.all([
      login('alice'),
      login('bob'),
    ]);
    const vote = (cookie: string) =>
      request(app.getHttpServer())
        .post('/api/v1/projects/shop/tests/login/approval')
        .set('Cookie', cookie)
        .send({ comparisonId: comparison.id });

    const results = await Promise.all([vote(aliceCookie), vote(bobCookie)]);
    expect(results.map((result) => result.status)).toEqual([201, 201]);

    // Each reviewer's vote is counted after its insert, not from a count read
    // before it: two votes that arrive together must still reach the required
    // total and complete the review.
    // Exactly one of them retries once: its snapshot was fixed before it
    // waited on the advisory lock while the other was committing, so it cannot
    // see that vote until the retry. The approval path states its own retry
    // budget (APPROVAL_MAX_ATTEMPTS) so the margin cannot be shrunk underneath
    // this test.
    expect(
      await db.approvalVote.count({ where: { comparisonId: comparison.id } }),
    ).toBe(2);
    expect(
      await db.approval.count({ where: { comparisonId: comparison.id } }),
    ).toBe(1);
  });

  // The case above asserts the outcome of a race; this one pins the mechanism
  // that makes the outcome hold: an approval may not read or record its vote
  // while another session holds the comparison's approval lock. A second
  // Postgres session takes exactly the lock the service takes, so the ordering
  // is forced instead of hoped for — without the lock the vote lands within
  // milliseconds and this case fails deterministically.
  it('does not record a vote while another session holds the comparison lock', async () => {
    await db.user.createMany({
      data: [
        { username: 'alice', passwordHash: await hashPassword('secret') },
        { username: 'bob', passwordHash: await hashPassword('secret') },
      ],
    });
    await db.project.update({
      where: { name: 'shop' },
      data: { requiredApprovals: 2 },
    });

    await upload('baseline_black.png').expect(201);
    await upload('baseline_blue.png').expect(201);
    await drainJobs();

    const comparison = await db.unifiedComparison.findFirstOrThrow({
      where: { status: 'PENDING_APPROVAL' },
    });
    const aliceCookie = await login('alice');

    const blocker = new Client({
      connectionString: app.get(AppConfigService).database.url,
    });
    await blocker.connect();
    let blockerOpen = true;
    await blocker.query('BEGIN');
    await blocker.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
      comparison.id,
    ]);

    try {
      let settled = false;
      const pending = voteAs(aliceCookie, comparison.id).then((response) => {
        settled = true;
        return response;
      });

      // Wait for the first observable effect of the request (its vote, or a
      // response). Neither may happen while the lock is held.
      await waitUntil(
        async () =>
          settled ||
          (await db.approvalVote.count({
            where: { comparisonId: comparison.id },
          })) > 0,
        1000,
      );
      expect(
        await db.approvalVote.count({ where: { comparisonId: comparison.id } }),
      ).toBe(0);
      expect(settled).toBe(false);

      await blocker.query('COMMIT');
      await blocker.end();
      blockerOpen = false;

      const response = await pending;
      expect(response.status).toBe(201);
      expect(response.body).toEqual(
        expect.objectContaining({ approved: false, votes: 1, required: 2 }),
      );
      expect(
        await db.approvalVote.count({
          where: { comparisonId: comparison.id },
        }),
      ).toBe(1);
      expect(
        await db.approval.count({ where: { comparisonId: comparison.id } }),
      ).toBe(0);
      expect(
        await db.unifiedComparison.findUnique({
          where: { id: comparison.id },
        }),
      ).not.toBeNull();

      // The second reviewer completes the gate, in whichever order they arrive.
      const bobCookie = await login('bob');
      expect((await voteAs(bobCookie, comparison.id)).status).toBe(201);
      expect(
        await db.approvalVote.count({
          where: { comparisonId: comparison.id },
        }),
      ).toBe(2);
      expect(
        await db.approval.count({ where: { comparisonId: comparison.id } }),
      ).toBe(1);
      expect(
        await db.unifiedComparison.findUnique({
          where: { id: comparison.id },
        }),
      ).toBeNull();
    } finally {
      if (blockerOpen) {
        await blocker.query('ROLLBACK');
        await blocker.end();
      }
    }
  });
});
