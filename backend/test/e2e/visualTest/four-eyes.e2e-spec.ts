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

describe('4-eyes approvals (e2e)', () => {
  let app: INestApplication;
  let db: PrismaClient;
  const baseline = path.join(__dirname, 'fixtures', 'baseline_black.png');
  const mismatch = path.join(__dirname, 'fixtures', 'baseline_blue.png');

  beforeAll(async () => {
    app = await TestApp.init();
    db = app.get(PrismaConnection).client;
  });

  beforeEach(async () => {
    await TestApp.resetDb();
    await TestApp.createProject('shop');
    await db.user.createMany({
      data: [
        {
          username: 'alice',
          passwordHash: await hashPassword('secret'),
          role: 'MEMBER',
        },
        {
          username: 'bob',
          passwordHash: await hashPassword('secret'),
          role: 'MEMBER',
        },
      ],
    });
  }, 30_000);

  afterAll(async () => {
    await TestApp.close();
  });

  async function login(username: string) {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ username, password: 'secret' })
      .expect(200);
    return response.get('Set-Cookie')![0].split(';')[0]!;
  }

  function uploadFrom(file: string) {
    return authRequest(app)
      .post('/api/v1/projects/shop/tests/login/upload?testKind=image')
      .field('viewport', '1920x1080')
      .field('browser', 'Chrome')
      .field('environment', 'staging')
      .attach('file', fs.createReadStream(file));
  }

  async function pendingComparisonId(): Promise<string> {
    await uploadFrom(baseline).expect(201);
    await uploadFrom(mismatch).expect(201);
    const comparison = await waitForComparison(app, 'shop', 'login');
    return comparison.body.comparison.id as string;
  }

  async function requireTwoApprovals() {
    await db.project.update({
      where: { name: 'shop' },
      data: { requiredApprovals: 2 },
    });
  }

  it('rejects an API-key approval when two approvals are required', async () => {
    const comparisonId = await pendingComparisonId();
    await requireTwoApprovals();

    const response = await authRequest(app)
      .post('/api/v1/projects/shop/tests/login/approval')
      .send({ comparisonId })
      .expect(403);

    expect(response.body.message).toMatch(/signed-in reviewers/i);
    expect(await db.approvalVote.count({ where: { comparisonId } })).toBe(0);
    expect(await db.approval.count({ where: { comparisonId } })).toBe(0);
    expect(
      await db.auditEvent.count({
        where: { action: 'review.vote', targetId: comparisonId },
      }),
    ).toBe(0);
  });

  it('finalizes only after two distinct session reviewers vote', async () => {
    const comparisonId = await pendingComparisonId();
    await requireTwoApprovals();

    const [alice, bob] = await Promise.all([
      db.user.findUniqueOrThrow({ where: { username: 'alice' } }),
      db.user.findUniqueOrThrow({ where: { username: 'bob' } }),
    ]);
    const aliceCookie = await login('alice');
    const bobCookie = await login('bob');
    const approve = (cookie: string) =>
      request(app.getHttpServer())
        .post('/api/v1/projects/shop/tests/login/approval')
        .set('Cookie', cookie)
        .send({ comparisonId });

    const first = await approve(aliceCookie).expect(201);
    expect(first.body).toEqual({
      approved: false,
      requiresMoreApprovals: true,
      votes: 1,
      required: 2,
    });

    await approve(aliceCookie).expect(409);

    const second = await approve(bobCookie).expect(201);
    expect(second.body).toEqual(expect.objectContaining({ approved: true }));

    const votes = await db.approvalVote.findMany({
      where: { comparisonId },
      orderBy: { approvedAt: 'asc' },
    });
    expect(votes.map((vote) => vote.userId)).toEqual([alice.id, bob.id]);
    expect(votes.map((vote) => vote.username)).toEqual(['alice', 'bob']);
    expect(await db.approval.count({ where: { comparisonId } })).toBe(1);

    const voteAudit = await db.auditEvent.findMany({
      where: { action: 'review.vote', targetId: comparisonId },
    });
    expect(voteAudit).toHaveLength(1);
    expect(voteAudit[0]).toEqual(
      expect.objectContaining({
        actor: 'alice',
        projectName: 'shop',
        testName: 'login',
        targetType: 'comparison',
        targetId: comparisonId,
        metadata: {
          comparisonId,
          votes: 1,
          required: 2,
          principalType: 'user',
        },
      }),
    );
  });
});
