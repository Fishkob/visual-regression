import { INestApplication } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { TestApp } from '../_support/utils/test-app';
import { authRequest } from '../_support/utils/authenticated-request';
import { PrismaConnection } from '@/prisma/prisma-connection';
import type { PrismaClient } from '@/prisma/client';
import { ComparisonJobProcessor } from '@public/visualTest/intake/workers/comparison-job-processor';
import { AppConfigService } from '@config/app-config.service';

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

  function approve(comparisonId: string) {
    return authRequest(app)
      .post('/api/v1/projects/shop/tests/login/approval')
      .send({ comparisonId });
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
});
