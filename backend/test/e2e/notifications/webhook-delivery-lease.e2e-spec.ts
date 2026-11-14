import { INestApplication } from '@nestjs/common';
import { TestApp } from '../_support/utils/test-app';
import { PrismaConnection } from '@/prisma/prisma-connection';
import {
  WebhookDeliveryRepository,
  WEBHOOK_PROCESSING_LEASE_MINUTES,
} from '@internal/webhooks/webhook-delivery.repository';
import type { PrismaClient } from '@/prisma/client';

// The webhook lease is the one place in the codebase whose mechanism is claimed
// by a string assertion: `webhook-delivery.repository.spec.ts` checks that the
// claim SQL still contains `FOR UPDATE SKIP LOCKED`, because no case ran two
// claimants against real rows. ADR-059 allows exactly one such assertion and
// says it goes when the race case arrives — this is that case.
//
// Whether the lock actually hands a delivery to one dispatcher, whether a *live*
// lease survives a concurrent claim, and whether an expired one comes back are
// all decisions Postgres makes. A stub that returns `[row]` cannot see any of
// them: it stays green for a claim with no lock at all, which is the bug the
// lock exists to prevent (the same customer callback delivered twice).
const DELIVERY_COUNT = 24;

describe('Webhook delivery lease (e2e)', () => {
  let app: INestApplication;
  let db: PrismaClient;
  let repository: WebhookDeliveryRepository;
  let endpointId: string;

  function minutesAgo(minutes: number): Date {
    return new Date(Date.now() - minutes * 60_000);
  }

  async function seedDelivery(
    overrides: {
      status?: 'PENDING' | 'PROCESSING' | 'DELIVERED' | 'FAILED';
      claimedAt?: Date | null;
      attempts?: number;
      createdAt?: Date;
    } = {},
  ) {
    return db.webhookDelivery.create({
      data: {
        endpointId,
        event: 'comparison.approved',
        payload: { event: 'comparison.approved' },
        status: overrides.status ?? 'PENDING',
        attempts: overrides.attempts ?? 0,
        claimedAt: overrides.claimedAt ?? null,
        ...(overrides.createdAt ? { createdAt: overrides.createdAt } : {}),
      },
    });
  }

  beforeAll(async () => {
    app = await TestApp.init();
    db = app.get(PrismaConnection).client;
    repository = app.get(WebhookDeliveryRepository);
  });

  beforeEach(async () => {
    await TestApp.resetDb();
    const { projectId } = await TestApp.createProject('webhook-lease');
    const endpoint = await db.webhookEndpoint.create({
      data: {
        projectId,
        url: 'https://hooks.example.com/lease',
        secret: 'whsec_e2e_lease',
        events: ['comparison.approved'],
        format: 'json',
      },
    });
    endpointId = endpoint.id;
  });

  afterAll(async () => {
    await TestApp.close();
  });

  it('hands a delivery to exactly one of many concurrent claims', async () => {
    for (let index = 0; index < DELIVERY_COUNT; index += 1) {
      // Staggered so the claim order is deterministic; the assertion does not
      // depend on it.
      await seedDelivery({ createdAt: new Date(Date.now() + index) });
    }

    const claims = await Promise.all(
      Array.from({ length: DELIVERY_COUNT }, () => repository.claimDue(1)),
    );
    const claimed = claims.flat().map((row) => row.id);

    // The property `FOR UPDATE SKIP LOCKED` provides: no delivery is handed to
    // two dispatchers. Without the lock every claimant reads the same PENDING
    // row, so this set shrinks below the claim count.
    expect(claimed.length).toBeGreaterThan(0);
    expect(new Set(claimed).size).toBe(claimed.length);

    // A returned row is claimed in the database, not just in the reply.
    await expect(
      db.webhookDelivery.count({ where: { status: 'PROCESSING' } }),
    ).resolves.toBe(claimed.length);

    // The rest is the caller's loop, not the claim's: `SKIP LOCKED` returns
    // nothing while other dispatchers still hold the remaining rows, so a round
    // legitimately claims fewer than it asked for. Draining is what the
    // dispatcher does on its next cycle — and it must not re-deliver a row the
    // concurrent round already took.
    const drained = (await repository.claimDue(100)).map((row) => row.id);
    expect(drained.length + claimed.length).toBe(DELIVERY_COUNT);
    expect(drained.filter((id) => claimed.includes(id))).toEqual([]);
  });

  it('leaves a delivery whose lease is still live to its dispatcher', async () => {
    // Just inside the lease: a second dispatcher must not requeue and re-claim
    // work that is still in flight, or one callback goes out twice within the
    // lease window.
    const inFlight = await seedDelivery({
      status: 'PROCESSING',
      claimedAt: minutesAgo(WEBHOOK_PROCESSING_LEASE_MINUTES - 1),
    });

    const claimed = await repository.claimDue(10);

    expect(claimed).toEqual([]);
    const row = await db.webhookDelivery.findUniqueOrThrow({
      where: { id: inFlight.id },
    });
    expect(row).toMatchObject({
      status: 'PROCESSING',
      attempts: 0,
      claimedAt: inFlight.claimedAt,
    });
  });

  it('reclaims a delivery whose lease expired and re-delivers it', async () => {
    const abandoned = await seedDelivery({
      status: 'PROCESSING',
      claimedAt: minutesAgo(WEBHOOK_PROCESSING_LEASE_MINUTES + 1),
    });

    const claimed = await repository.claimDue(10);

    expect(claimed.map((row) => row.id)).toEqual([abandoned.id]);
    const row = await db.webhookDelivery.findUniqueOrThrow({
      where: { id: abandoned.id },
    });
    // The attempt counts against the retry budget: a delivery that keeps
    // killing its dispatcher must exhaust its budget instead of looping.
    expect(row).toMatchObject({ status: 'PROCESSING', attempts: 1 });
    expect(row.claimedAt).toBeInstanceOf(Date);
  });
});
