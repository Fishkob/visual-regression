import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { TestApp } from '../_support/utils/test-app';
import { authRequest } from '../_support/utils/authenticated-request';
import { PrismaConnection } from '@/prisma/prisma-connection';
import type { PrismaClient } from '@/prisma/client';
import { hashPassword } from '@internal/auth/password-hasher';

const ENDPOINT_URL = 'https://hooks.example.com/vrt';
const OTHER_URL = 'https://hooks.example.com/vrt-v2';

describe('Webhook management (e2e)', () => {
  let app: INestApplication;
  let db: PrismaClient;
  let cookie: string;
  let memberCookie: string;

  beforeAll(async () => {
    app = await TestApp.init();
    db = app.get(PrismaConnection).client;
  });

  beforeEach(async () => {
    await TestApp.resetDb();
    await TestApp.createProject('shop');
    await db.user.create({
      data: {
        username: 'admin',
        passwordHash: await hashPassword('secret'),
        role: 'ADMIN',
      },
    });
    await db.user.create({
      data: {
        username: 'member',
        passwordHash: await hashPassword('secret'),
        role: 'MEMBER',
      },
    });
    cookie = await login('admin');
    memberCookie = await login('member');
  }, 30_000);

  afterAll(async () => {
    await TestApp.close();
  });

  async function login(username: string): Promise<string> {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ username, password: 'secret' })
      .expect(200);
    return response.get('Set-Cookie')![0]!.split(';')[0]!;
  }

  function list() {
    return request(app.getHttpServer())
      .get('/api/v1/projects/shop/webhooks')
      .set('Cookie', cookie);
  }

  function create(body: Record<string, unknown>) {
    return request(app.getHttpServer())
      .post('/api/v1/projects/shop/webhooks')
      .set('Cookie', cookie)
      .send(body);
  }

  function patch(id: string, body: Record<string, unknown>) {
    return request(app.getHttpServer())
      .patch(`/api/v1/projects/shop/webhooks/${id}`)
      .set('Cookie', cookie)
      .send(body);
  }

  async function createEndpoint(body: Record<string, unknown> = {}): Promise<{
    id: string;
    secret: string;
    secretPreview: string;
  }> {
    const response = await create({
      url: ENDPOINT_URL,
      events: ['review.requested', 'comparison.approved'],
      format: 'json',
      ...body,
    }).expect(201);
    return response.body;
  }

  it('creates an endpoint, reveals the secret once and masks it afterwards', async () => {
    await list().expect(200, []);

    const created = await createEndpoint();
    expect(created).toEqual(
      expect.objectContaining({
        id: expect.any(String),
        url: ENDPOINT_URL,
        events: ['review.requested', 'comparison.approved'],
        format: 'json',
        active: true,
        secret: expect.any(String),
        secretPreview: expect.stringMatching(/^\*{4}/),
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
      }),
    );
    expect(created.secretPreview).toBe(`****${created.secret.slice(-4)}`);

    const listed = await list().expect(200);
    expect(listed.body).toHaveLength(1);
    expect(listed.body[0]).toEqual(
      expect.objectContaining({
        id: created.id,
        url: ENDPOINT_URL,
        secretPreview: created.secretPreview,
      }),
    );
    expect(listed.body[0].secret).toBeUndefined();

    const audit = await db.auditEvent.findMany({
      where: { action: 'webhook.create', targetId: created.id },
    });
    expect(audit).toHaveLength(1);
    expect(audit[0]).toEqual(
      expect.objectContaining({ actor: 'admin', projectName: 'shop' }),
    );
  });

  it('rejects endpoint URLs that would probe loopback or cloud metadata', async () => {
    for (const url of [
      'http://127.0.0.1:9000/hook',
      'http://0.0.0.0/hook',
      'http://foo.localhost/hook',
      'http://169.254.169.254/latest/meta-data',
      'http://metadata.google.internal/computeMetadata',
      'http://[::1]/hook',
    ]) {
      const rejected = await create({
        url,
        events: ['review.requested'],
      }).expect(400);
      expect(rejected.body.message).toContain('is not allowed');
    }

    await list().expect(200, []);
  });

  it('updates the endpoint events, url and active state', async () => {
    const created = await createEndpoint();

    const updated = await patch(created.id, {
      url: OTHER_URL,
      events: ['review.comment'],
      format: 'slack',
      active: false,
    }).expect(200);
    expect(updated.body).toEqual(
      expect.objectContaining({
        id: created.id,
        url: OTHER_URL,
        events: ['review.comment'],
        format: 'slack',
        active: false,
        secretPreview: created.secretPreview,
      }),
    );
    expect(updated.body.secret).toBeUndefined();

    const disabled = await patch(created.id, { active: true }).expect(200);
    expect(disabled.body.active).toBe(true);

    // Rotating the signing secret is the one update that reveals it again.
    const rotated = await patch(created.id, {
      secret: 'whsec_rotated_secret_value',
    }).expect(200);
    expect(rotated.body.secret).toBe('whsec_rotated_secret_value');
    expect(rotated.body.secretPreview).toBe('****alue');

    const listed = await list().expect(200);
    expect(listed.body[0]).toEqual(
      expect.objectContaining({
        url: OTHER_URL,
        events: ['review.comment'],
        secretPreview: '****alue',
      }),
    );

    const audit = await db.auditEvent.findMany({
      where: { action: 'webhook.update', targetId: created.id },
      orderBy: { createdAt: 'asc' },
    });
    expect(audit).toHaveLength(3);
    expect(audit[2]!.metadata).toEqual(
      expect.objectContaining({ secretRotated: true }),
    );
  });

  it('answers 404 for an unknown endpoint and an unknown project', async () => {
    await patch('missing', { active: false }).expect(404);
    await request(app.getHttpServer())
      .get('/api/v1/projects/shop/webhooks/missing/deliveries')
      .set('Cookie', cookie)
      .expect(404);
    await request(app.getHttpServer())
      .get('/api/v1/projects/ghost/webhooks')
      .set('Cookie', cookie)
      .expect(404);
  });

  it('queues a synthetic test delivery and lists it', async () => {
    const created = await createEndpoint();

    const queued = await request(app.getHttpServer())
      .post(`/api/v1/projects/shop/webhooks/${created.id}/test`)
      .set('Cookie', cookie)
      .expect(202);
    expect(queued.body).toEqual({ queued: true });

    const deliveries = await request(app.getHttpServer())
      .get(`/api/v1/projects/shop/webhooks/${created.id}/deliveries`)
      .set('Cookie', cookie)
      .expect(200);
    expect(deliveries.body).toHaveLength(1);
    expect(deliveries.body[0]).toEqual(
      expect.objectContaining({
        id: expect.any(String),
        event: 'test',
        status: 'PENDING',
        attempts: 0,
        responseStatus: null,
        lastError: null,
        deliveredAt: null,
        createdAt: expect.any(String),
      }),
    );

    const rows = await db.webhookDelivery.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.payload).toEqual(
      expect.objectContaining({
        event: 'test',
        project: { name: 'shop' },
        branch: null,
      }),
    );
  });

  it('replays a failed delivery back into the queue', async () => {
    const created = await createEndpoint();
    const endpoint = await db.webhookEndpoint.findFirstOrThrow();
    const delivery = await db.webhookDelivery.create({
      data: {
        endpointId: endpoint.id,
        event: 'comparison.approved',
        payload: { event: 'comparison.approved' },
        status: 'FAILED',
        attempts: 3,
        responseStatus: 502,
        lastError: 'HTTP 502',
        deliveredAt: null,
      },
    });

    const replayed = await request(app.getHttpServer())
      .post(
        `/api/v1/projects/shop/webhooks/${created.id}/deliveries/${delivery.id}/replay`,
      )
      .set('Cookie', cookie)
      .expect(202);
    expect(replayed.body).toEqual({ queued: true });

    const row = await db.webhookDelivery.findUniqueOrThrow({
      where: { id: delivery.id },
    });
    expect(row).toEqual(
      expect.objectContaining({
        status: 'PENDING',
        attempts: 0,
        responseStatus: null,
        lastError: null,
        deliveredAt: null,
        claimedAt: null,
      }),
    );
    expect(row.nextAttemptAt).toBeInstanceOf(Date);

    await request(app.getHttpServer())
      .post(
        `/api/v1/projects/shop/webhooks/${created.id}/deliveries/nope/replay`,
      )
      .set('Cookie', cookie)
      .expect(404);
  });

  it('deletes the endpoint together with its delivery log', async () => {
    const created = await createEndpoint();
    await request(app.getHttpServer())
      .post(`/api/v1/projects/shop/webhooks/${created.id}/test`)
      .set('Cookie', cookie)
      .expect(202);
    await expect(db.webhookDelivery.count()).resolves.toBe(1);

    await request(app.getHttpServer())
      .delete(`/api/v1/projects/shop/webhooks/${created.id}`)
      .set('Cookie', cookie)
      .expect(204);

    await list().expect(200, []);
    await expect(
      db.webhookEndpoint.count({ where: { id: created.id } }),
    ).resolves.toBe(0);
    await expect(db.webhookDelivery.count()).resolves.toBe(0);

    const audit = await db.auditEvent.findMany({
      where: { action: 'webhook.delete', targetId: created.id },
    });
    expect(audit).toHaveLength(1);
    expect(audit[0]!.metadata).toEqual(
      expect.objectContaining({ url: ENDPOINT_URL }),
    );
  });

  it('keeps webhook administration away from api keys and members', async () => {
    const created = await createEndpoint();

    // The CI credential must never read or edit review notifications, and a
    // MEMBER session is not an administrator.
    await authRequest(app).get('/api/v1/projects/shop/webhooks').expect(403);
    await authRequest(app)
      .post('/api/v1/projects/shop/webhooks')
      .send({ url: ENDPOINT_URL, events: ['review.requested'] })
      .expect(403);
    await authRequest(app)
      .delete(`/api/v1/projects/shop/webhooks/${created.id}`)
      .expect(403);

    await request(app.getHttpServer())
      .get('/api/v1/projects/shop/webhooks')
      .set('Cookie', memberCookie)
      .expect(403);
    await request(app.getHttpServer())
      .post(`/api/v1/projects/shop/webhooks/${created.id}/test`)
      .set('Cookie', memberCookie)
      .expect(403);
  });
});
