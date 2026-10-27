import { INestApplication } from '@nestjs/common';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import * as fs from 'fs';
import * as path from 'path';
import request from 'supertest';
import { TestApp } from '../_support/utils/test-app';
import { authRequest } from '../_support/utils/authenticated-request';
import { PrismaConnection } from '@/prisma/prisma-connection';
import { PrismaClient } from '@/prisma/client';
import { hashPassword } from '@internal/auth/password-hasher';
import { WebhookDispatcher } from '@internal/webhooks/webhook-dispatcher.service';
import { signWebhookDelivery } from '@internal/webhooks/webhook-signature';

const SECRET = 'whsec_e2e_delivery_secret';

// The outbox's delivery side: claim (`FOR UPDATE SKIP LOCKED`), sign, send,
// retry with backoff, give up. Until this spec it was only exercised against a
// mocked fetch and a mocked repository, so the claim SQL and the lease never ran
// against Postgres — which is where the two transaction bugs found in this area
// were hiding.
describe('Webhook delivery (e2e)', () => {
  let app: INestApplication;
  let db: PrismaClient;
  let server: Server;
  let endpointUrl: string;
  let respondWith = 200;
  const received: {
    headers: Record<string, string | string[] | undefined>;
    body: string;
  }[] = [];
  const baseline = path.join(__dirname, 'fixtures', 'baseline_black.png');

  beforeAll(async () => {
    server = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (chunk: Buffer) => chunks.push(chunk));
      req.on('end', () => {
        received.push({
          headers: req.headers,
          body: Buffer.concat(chunks).toString('utf8'),
        });
        res.writeHead(respondWith, { 'content-type': 'application/json' });
        res.end('{}');
      });
    });
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', resolve);
    });
    const { port } = server.address() as AddressInfo;
    endpointUrl = `http://127.0.0.1:${String(port)}/hook`;

    app = await TestApp.init();
    db = app.get(PrismaConnection).client;
  });

  afterAll(async () => {
    await TestApp.close();
    await new Promise<void>((resolve) => {
      server.close(() => {
        resolve();
      });
    });
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
    received.length = 0;
    respondWith = 200;
  });

  async function login(username: string): Promise<string> {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ username, password: 'secret' })
      .expect(200);
    return response.get('Set-Cookie')![0]!.split(';')[0]!;
  }

  // The endpoint is seeded rather than created through the API: the create path
  // rejects loopback URLs (the SSRF guard is doing its job), and this spec is
  // about the dispatcher, not about URL admission.
  async function seedEndpoint(input: { active?: boolean } = {}): Promise<void> {
    const project = await db.project.findFirstOrThrow({
      where: { name: 'shop' },
    });
    await db.webhookEndpoint.create({
      data: {
        projectId: project.id,
        url: endpointUrl,
        secret: SECRET,
        events: ['review.assigned'],
        active: input.active ?? true,
      },
    });
  }

  // Upload a baseline (so the test exists) and assign it: the assignment writes
  // one outbox row per subscribed endpoint inside its transaction.
  async function assignReview(): Promise<void> {
    await authRequest(app)
      .post('/api/v1/projects/shop/tests/login/upload?testKind=image')
      .field('viewport', '1920x1080')
      .field('browser', 'Chrome')
      .field('environment', 'staging')
      .attach('file', fs.createReadStream(baseline))
      .expect(201);

    const admin = await login('admin');
    await request(app.getHttpServer())
      .post('/api/v1/projects/shop/assignments')
      .set('Cookie', admin)
      .send({ testName: 'login', assignee: 'admin' })
      .expect(201);
  }

  function dispatcher(): WebhookDispatcher {
    return app.get(WebhookDispatcher);
  }

  it('claims, signs and delivers the queued event', async () => {
    await seedEndpoint();
    await assignReview();

    const result = await dispatcher().runOnce();

    expect(result).toEqual({ delivered: 1, retried: 0, failed: 0 });
    expect(received).toHaveLength(1);

    const delivery = received[0]!;
    const timestamp = delivery.headers['x-vrt-timestamp'];
    expect(delivery.headers['x-vrt-event']).toBe('review.assigned');
    expect(delivery.headers['x-vrt-delivery-id']).toBeTruthy();
    // The consumer verifies `timestamp.body`; recomputing it with the shipped
    // helper keeps sender and verifier on one contract.
    expect(delivery.headers['x-vrt-signature']).toBe(
      signWebhookDelivery(SECRET, Number(timestamp), delivery.body),
    );
    // The payload is nested on purpose: `project`/`test` are objects so a
    // consumer can key off names without a second lookup.
    expect(JSON.parse(delivery.body)).toMatchObject({
      event: 'review.assigned',
      project: { name: 'shop' },
      test: { name: 'login', kind: 'image' },
      assignee: 'admin',
      branch: 'main',
    });

    const row = await db.webhookDelivery.findFirstOrThrow();
    expect(row).toMatchObject({
      status: 'DELIVERED',
      attempts: 0,
      responseStatus: 200,
      lastError: null,
    });
    expect(row.deliveredAt).toBeInstanceOf(Date);
  });

  it('returns the row to the queue with a backoff after a failing endpoint', async () => {
    respondWith = 500;
    await seedEndpoint();
    await assignReview();

    const first = await dispatcher().runOnce();
    expect(first).toEqual({ delivered: 0, retried: 1, failed: 0 });

    const row = await db.webhookDelivery.findFirstOrThrow();
    expect(row.status).toBe('PENDING');
    expect(row.attempts).toBe(1);
    expect(row.lastError).toContain('HTTP 500');
    expect(row.nextAttemptAt).not.toBeNull();
    expect(row.nextAttemptAt!.getTime()).toBeGreaterThan(Date.now());

    // Not due yet: the backoff keeps the next pass from hammering the endpoint.
    const second = await dispatcher().runOnce();
    expect(second).toEqual({ delivered: 0, retried: 0, failed: 0 });
    expect(received).toHaveLength(1);
  });

  it('fails a delivery whose endpoint was disabled after the event was queued', async () => {
    // A row is only written for an endpoint that was active at enqueue time, so
    // the dispatcher's disabled branch is reachable only by disabling it after
    // the event was queued — which is exactly the operator's "turn it off" case.
    await seedEndpoint();
    await assignReview();
    await db.webhookEndpoint.updateMany({ data: { active: false } });

    const result = await dispatcher().runOnce();

    expect(result).toEqual({ delivered: 0, retried: 0, failed: 1 });
    expect(received).toHaveLength(0);
    const row = await db.webhookDelivery.findFirstOrThrow();
    expect(row.status).toBe('FAILED');
    expect(row.lastError).toBe('Endpoint is disabled or deleted');
  });
});
