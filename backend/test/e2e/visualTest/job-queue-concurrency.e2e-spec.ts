import { INestApplication } from '@nestjs/common';
import { TestApp } from '../_support/utils/test-app';
import { PrismaConnection } from '@/prisma/prisma-connection';
import type { PrismaClient } from '@/prisma/client';
import { PostgresJobQueue } from '@internal/job-queue/postgres-job-queue';
import { WORKER_TIMING } from '@common/utils/worker-timing';

// These cases exist because the unit spec can only assert on the SQL text the
// queue sends to a mocked `$queryRawUnsafe`. Whether `FOR UPDATE SKIP LOCKED`
// actually hands a row to exactly one claimant, whether a stale heartbeat is
// the *only* thing that makes a PROCESSING job reclaimable, and whether the
// ownership guard really stops a superseded worker from writing are all
// decisions Postgres makes. A real database is the only place they are tested.
describe('Comparison job queue semantics (e2e)', () => {
  let app: INestApplication;
  let db: PrismaClient;
  let queue: PostgresJobQueue;
  let testId: string;

  const payload = (candidateId: string) => ({
    testKind: 'image' as const,
    projectName: 'queue',
    testId,
    candidateHash: `hash-${candidateId}`,
    baseline: { id: 'baseline-1', url: 'http://storage/baseline.png' },
    candidate: { id: candidateId, url: `http://storage/${candidateId}.png` },
    variant: {
      viewport: '1920x1080',
      browser: 'Chrome',
      environment: 'staging',
    },
  });

  function staleHeartbeat(): Date {
    return new Date(
      Date.now() - (WORKER_TIMING.stallTimeoutSeconds + 60) * 1000,
    );
  }

  async function seedJob(
    overrides: {
      status?: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
      heartbeatAt?: Date | null;
      attempts?: number;
      maxAttempts?: number;
      createdAt?: Date;
    } = {},
  ) {
    const candidateId = `candidate-${Math.random().toString(36).slice(2, 10)}`;
    return db.comparisonJob.create({
      data: {
        testId,
        payload: payload(candidateId),
        candidateId,
        variantViewport: '1920x1080',
        variantBrowser: 'Chrome',
        variantEnvironment: 'staging',
        status: overrides.status ?? 'PENDING',
        attempts: overrides.attempts ?? 0,
        maxAttempts: overrides.maxAttempts ?? 3,
        heartbeatAt: overrides.heartbeatAt ?? null,
        ...(overrides.createdAt ? { createdAt: overrides.createdAt } : {}),
      },
    });
  }

  beforeAll(async () => {
    app = await TestApp.init();
    db = app.get(PrismaConnection).client;
    queue = app.get(PostgresJobQueue);
  });

  beforeEach(async () => {
    await TestApp.resetDb();
    const { branchId } = await TestApp.createProject('queue');
    const test = await db.unifiedTest.create({
      data: { branchId, name: 'job-queue' },
    });
    testId = test.id;
  });

  afterAll(async () => {
    await TestApp.close();
  });

  it('hands a row to exactly one of many concurrent claims', async () => {
    const jobCount = 24;
    for (let i = 0; i < jobCount; i++) {
      // Stagger createdAt so the claim order is deterministic; the assertion
      // does not depend on it.
      await seedJob({ createdAt: new Date(Date.now() + i) });
    }

    const claims = await Promise.all(
      Array.from({ length: jobCount }, () => queue.claimNext()),
    );

    const claimedIds = claims
      .filter((job): job is NonNullable<typeof job> => job !== null)
      .map((job) => job.id);

    expect(claimedIds).toHaveLength(jobCount);
    expect(new Set(claimedIds).size).toBe(jobCount);

    const processing = await db.comparisonJob.count({
      where: { status: 'PROCESSING' },
    });
    expect(processing).toBe(jobCount);
  });

  it('reclaims a PROCESSING job whose heartbeat went stale', async () => {
    const stalled = await seedJob({
      status: 'PROCESSING',
      heartbeatAt: staleHeartbeat(),
    });

    const claimed = await queue.claimNext();

    expect(claimed?.id).toBe(stalled.id);
    const row = await db.comparisonJob.findUniqueOrThrow({
      where: { id: stalled.id },
    });
    expect(row.status).toBe('PROCESSING');
    expect(row.attempts).toBe(1);
    expect(row.processingStartedAt).not.toBeNull();
  });

  it('leaves a PROCESSING job with a fresh heartbeat alone', async () => {
    await seedJob({ status: 'PROCESSING', heartbeatAt: new Date() });

    await expect(queue.claimNext()).resolves.toBeNull();
  });

  it('fails a stalled job that burned its budget and claims the next pending one', async () => {
    const exhausted = await seedJob({
      status: 'PROCESSING',
      heartbeatAt: staleHeartbeat(),
      attempts: 2,
      maxAttempts: 3,
    });
    const pending = await seedJob();

    const claimed = await queue.claimNext();

    expect(claimed?.id).toBe(pending.id);
    const row = await db.comparisonJob.findUniqueOrThrow({
      where: { id: exhausted.id },
    });
    expect(row.status).toBe('FAILED');
    expect(row.attempts).toBe(3);
    expect(row.error).toBe('Job stalled and exhausted its retry budget');
    expect(row.completedAt).not.toBeNull();
  });

  it('ignores a booking write from a worker whose row was reclaimed', async () => {
    const job = await seedJob({
      status: 'PROCESSING',
      heartbeatAt: staleHeartbeat(),
    });

    const firstOwner = await queue.claimNext();
    expect(firstOwner?.id).toBe(job.id);

    // A second worker reclaims the row: same id, new processingStartedAt.
    await db.comparisonJob.update({
      where: { id: job.id },
      data: { heartbeatAt: staleHeartbeat() },
    });
    const secondOwner = await queue.claimNext();
    expect(secondOwner?.id).toBe(job.id);
    expect(secondOwner?.processingStartedAt).not.toEqual(
      firstOwner?.processingStartedAt,
    );

    await queue.markCompleted(job.id, firstOwner?.processingStartedAt);

    const row = await db.comparisonJob.findUniqueOrThrow({
      where: { id: job.id },
    });
    expect(row.status).toBe('PROCESSING');
    expect(row.completedAt).toBeNull();
  });

  it('moves a retryable failure back to PENDING with a backoff, not to FAILED', async () => {
    const job = await seedJob();
    const claimed = await queue.claimNext();
    expect(claimed?.id).toBe(job.id);
    if (!claimed) throw new Error('unreachable');

    await expect(
      queue.markFailed(
        claimed.id,
        'sidecar timed out',
        claimed.attempts,
        claimed.maxAttempts,
        claimed.processingStartedAt,
      ),
    ).resolves.toBe('retry');

    const row = await db.comparisonJob.findUniqueOrThrow({
      where: { id: job.id },
    });
    expect(row.status).toBe('PENDING');
    expect(row.attempts).toBe(1);
    expect(row.nextAttemptAt).not.toBeNull();
    expect(row.nextAttemptAt!.getTime()).toBeGreaterThan(Date.now());
  });

  it('holds a retried job back until its nextAttemptAt has passed', async () => {
    const job = await seedJob();
    const claimed = await queue.claimNext();
    if (!claimed) throw new Error('claim failed');

    await queue.markFailed(
      claimed.id,
      'sidecar timed out',
      claimed.attempts,
      claimed.maxAttempts,
      claimed.processingStartedAt,
    );

    // The backoff base is 1s; the row must not be claimable before it elapses.
    await expect(queue.claimNext()).resolves.toBeNull();

    await db.comparisonJob.update({
      where: { id: job.id },
      data: { nextAttemptAt: new Date(Date.now() - 1) },
    });

    const reclaimed = await queue.claimNext();
    expect(reclaimed?.id).toBe(job.id);
    expect(reclaimed?.attempts).toBe(1);
  });
});
