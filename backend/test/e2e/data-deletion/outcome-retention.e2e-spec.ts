import { INestApplication } from '@nestjs/common';
import { PrismaConnection } from '@/prisma/prisma-connection';
import { AppConfigService } from '@config/app-config.service';
import { OutcomeRetentionTask } from '@internal/data-deletion/tasks/outcome-retention.task';
import { TestApp } from '../_support/utils/test-app';
import type { PrismaClient } from '@/prisma/client';

// The one thing a mock cannot prove about a destructive sweep: that it deletes
// the rows it is supposed to and no others. The unit spec pins the cutoff it
// *asks for* (`where.createdAt.lt`) against a stub; it would stay green if the
// comparison were off by a timezone, if `deleteMany` matched nothing, or if the
// batch loop stopped one iteration short. Those are the three ways a retention
// task loses history or retains it forever, and each needs real Postgres.
//
// The window comes from the running configuration (400 days by default), so the
// fixtures are 500 days old and 10 days old — comfortably either side of the
// cutoff rather than straddling it.
const DAY_MS = 24 * 60 * 60 * 1000;
const OLD_DAYS = 500;
const RECENT_DAYS = 10;
const BATCH_SIZE = 10_000;

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * DAY_MS);
}

describe('OutcomeRetentionTask (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let task: OutcomeRetentionTask;

  beforeAll(async () => {
    app = await TestApp.init();
    prisma = app.get(PrismaConnection).client;
    task = app.get(OutcomeRetentionTask);
  });

  beforeEach(async () => {
    await TestApp.resetDb();
  });

  afterAll(async () => {
    await TestApp.close();
  });

  function outcome(createdAt: Date, marker: string) {
    return {
      testId: `test-${marker}`,
      testName: `test-${marker}`,
      kind: 'image' as const,
      viewport: '1920x1080',
      browser: 'chrome',
      environment: 'staging',
      outcome: 'changed',
      mismatchMetric: 12,
      createdAt,
    };
  }

  async function markerOf(eventId: string): Promise<string | null> {
    const row = await prisma.comparisonOutcomeEvent.findUnique({
      where: { id: eventId },
      select: { testId: true },
    });
    return row?.testId ?? null;
  }

  it('deletes the history the trends window cannot reach and keeps the rest', async () => {
    const old = await prisma.comparisonOutcomeEvent.create({
      data: outcome(daysAgo(OLD_DAYS), 'old'),
    });
    const recent = await prisma.comparisonOutcomeEvent.create({
      data: outcome(daysAgo(RECENT_DAYS), 'recent'),
    });

    const result = await task.execute();

    expect(await markerOf(old.id)).toBeNull();
    expect(await markerOf(recent.id)).toBe('test-recent');
    expect(result.gauges).toEqual(
      expect.arrayContaining([{ name: 'cleanup_outcomes_deleted', value: 1 }]),
    );
  });

  it('leaves the whole history alone when nothing is past the window', async () => {
    const recent = await prisma.comparisonOutcomeEvent.create({
      data: outcome(daysAgo(RECENT_DAYS), 'recent'),
    });

    const result = await task.execute();

    expect(await markerOf(recent.id)).toBe('test-recent');
    expect(result.gauges).toEqual(
      expect.arrayContaining([{ name: 'cleanup_outcomes_deleted', value: 0 }]),
    );
  });

  it('drains a backlog that needs more than one batch', async () => {
    // One row past a whole batch boundary: a loop that stops after the first
    // pass, or after a pass that returned a full batch, leaves that row behind
    // forever (the next run starts at the same cutoff and would find it again,
    // so the symptom is a sweep that never converges).
    const total = BATCH_SIZE + 7;
    await prisma.comparisonOutcomeEvent.createMany({
      data: Array.from({ length: total }, (_, index) =>
        outcome(daysAgo(OLD_DAYS), `bulk-${String(index)}`),
      ),
    });

    const result = await task.execute();

    expect(await prisma.comparisonOutcomeEvent.count()).toBe(0);
    expect(result.gauges).toEqual(
      expect.arrayContaining([
        { name: 'cleanup_outcomes_deleted', value: total },
      ]),
    );
  });

  it('keeps every row when the operator disables the window', async () => {
    // Built by hand against the same live connection: the sweep reads its window
    // once, in the constructor, so a disabled window is a different instance of
    // the same task rather than a different code path.
    const disabled = new OutcomeRetentionTask(app.get(PrismaConnection), {
      outcomeRetention: { days: 0 },
    } as AppConfigService);
    const old = await prisma.comparisonOutcomeEvent.create({
      data: outcome(daysAgo(OLD_DAYS), 'old'),
    });

    const result = await disabled.execute();

    expect(await markerOf(old.id)).toBe('test-old');
    expect(result.gauges).toBeUndefined();
  });

  it('deletes nothing outside the outcome trail', async () => {
    // The sweep runs unsupervised against tables it does not own, so the blast
    // radius is part of the contract: an audit row from the same age must
    // survive a history that only the outcome sweep is allowed to prune.
    const audit = await prisma.auditEvent.create({
      data: {
        action: 'test.approved',
        targetType: 'UnifiedTest',
        targetId: 'audit-1',
        createdAt: daysAgo(OLD_DAYS),
      },
    });
    await prisma.comparisonOutcomeEvent.create({
      data: outcome(daysAgo(OLD_DAYS), 'old'),
    });

    await task.execute();

    const survivor = await prisma.auditEvent.findUnique({
      where: { id: audit.id },
    });
    expect(survivor).not.toBeNull();
  });
});
