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

describe('Review assignments (e2e)', () => {
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
          username: 'admin',
          passwordHash: await hashPassword('secret'),
          role: 'ADMIN',
        },
        {
          username: 'alice',
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

  function upload(file: string) {
    return authRequest(app)
      .post('/api/v1/projects/shop/tests/login/upload?testKind=image')
      .field('viewport', '1920x1080')
      .field('browser', 'Chrome')
      .field('environment', 'staging')
      .attach('file', fs.createReadStream(file));
  }

  it('assigns a test, lists it for the assignee and completes it', async () => {
    await upload(baseline).expect(201);
    const admin = await login('admin');

    const created = await request(app.getHttpServer())
      .post('/api/v1/projects/shop/assignments')
      .set('Cookie', admin)
      .send({
        testName: 'login',
        assignee: 'alice',
        dueAt: new Date(Date.now() - 60_000).toISOString(),
      })
      .expect(201);
    expect(created.body).toEqual(
      expect.objectContaining({
        assigneeUsername: 'alice',
        testName: 'login',
        isOverdue: true,
      }),
    );

    const alice = await login('alice');
    const mine = await request(app.getHttpServer())
      .get('/api/v1/assignments/mine')
      .set('Cookie', alice)
      .expect(200);
    expect(mine.body).toHaveLength(1);

    const overdue = await request(app.getHttpServer())
      .get('/api/v1/assignments/mine/overdue')
      .set('Cookie', alice)
      .expect(200);
    expect(overdue.body).toHaveLength(1);

    await request(app.getHttpServer())
      .post(`/api/v1/assignments/${created.body.id}/complete`)
      .set('Cookie', alice)
      .expect(201);

    const after = await request(app.getHttpServer())
      .get('/api/v1/assignments/mine')
      .set('Cookie', alice)
      .expect(200);
    expect(after.body).toHaveLength(0);
  });

  it('creates the assignment together with its webhook delivery and audit trail', async () => {
    await upload(baseline).expect(201);
    const admin = await login('admin');

    // The one configuration that exposes a missing transaction: the outbox
    // write asserts its transaction only AFTER it finds a subscribed endpoint,
    // so without an endpoint the assignment still succeeded while writing three
    // rows that could not roll back together.
    await request(app.getHttpServer())
      .post('/api/v1/projects/shop/webhooks')
      .set('Cookie', admin)
      .send({
        url: 'https://hooks.example.com/vrt',
        events: ['review.assigned'],
      })
      .expect(201);

    const created = await request(app.getHttpServer())
      .post('/api/v1/projects/shop/assignments')
      .set('Cookie', admin)
      .send({ testName: 'login', assignee: 'alice' })
      .expect(201);
    expect(created.body).toEqual(
      expect.objectContaining({ assigneeUsername: 'alice' }),
    );

    const delivery = await db.webhookDelivery.findFirst({
      where: { event: 'review.assigned' },
    });
    expect(delivery).not.toBeNull();

    const trail = await db.auditEvent.findFirst({
      where: { action: 'review.assign', targetId: created.body.id },
    });
    expect(trail).toMatchObject({
      actor: 'admin',
      targetType: 'assignment',
      projectName: 'shop',
    });
  });

  it('filters the inbox to my assignments', async () => {
    await upload(baseline).expect(201);
    await upload(mismatch).expect(201);
    await waitForComparison(app, 'shop', 'login');
    const admin = await login('admin');
    await request(app.getHttpServer())
      .post('/api/v1/projects/shop/assignments')
      .set('Cookie', admin)
      .send({ testName: 'login', assignee: 'alice' })
      .expect(201);

    const alice = await login('alice');
    const mine = await request(app.getHttpServer())
      .get('/api/v1/projects/shop/tests/meta/pending?assignedToMe=true')
      .set('Cookie', alice)
      .expect(200);
    expect(mine.body.data).toHaveLength(1);

    const adminInbox = await request(app.getHttpServer())
      .get('/api/v1/projects/shop/tests/meta/pending?assignedToMe=true')
      .set('Cookie', admin)
      .expect(200);
    expect(adminInbox.body.data).toHaveLength(0);
  });
});
