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

  it('finalizes only after two distinct reviewers', async () => {
    await authRequest(app)
      .post('/api/v1/projects/shop/tests/login/upload?testKind=image')
      .field('viewport', '1920x1080')
      .field('browser', 'Chrome')
      .field('environment', 'staging')
      .attach('file', fs.createReadStream(baseline))
      .expect(201);
    await authRequest(app)
      .post('/api/v1/projects/shop/tests/login/upload?testKind=image')
      .field('viewport', '1920x1080')
      .field('browser', 'Chrome')
      .field('environment', 'staging')
      .attach('file', fs.createReadStream(mismatch))
      .expect(201);
    const comparison = await waitForComparison(app, 'shop', 'login');
    const comparisonId = comparison.body.comparison.id as string;
    await db.project.update({
      where: { name: 'shop' },
      data: { requiredApprovals: 2 },
    });

    const alice = await login('alice');
    const bob = await login('bob');
    const approve = (cookie: string) =>
      request(app.getHttpServer())
        .post('/api/v1/projects/shop/tests/login/approval')
        .set('Cookie', cookie)
        .send({ comparisonId });

    const first = await approve(alice).expect(201);
    expect(first.body).toEqual({
      approved: false,
      requiresMoreApprovals: true,
      votes: 1,
      required: 2,
    });

    await approve(alice).expect(409);

    const second = await approve(bob).expect(201);
    expect(second.body).toEqual(expect.objectContaining({ approved: true }));
    expect(await db.approvalVote.count({ where: { comparisonId } })).toBe(2);
    expect(await db.approval.count({ where: { comparisonId } })).toBe(1);
  });
});
