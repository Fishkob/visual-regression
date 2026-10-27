import { INestApplication } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import request from 'supertest';
import { TestApp } from '../_support/utils/test-app';
import { PrismaConnection } from '@/prisma/prisma-connection';
import { PrismaClient } from '@/prisma/client';
import { hashPassword } from '@internal/auth/password-hasher';

describe('API key scopes (e2e)', () => {
  let app: INestApplication;
  let db: PrismaClient;
  let adminCookie: string;

  const baseline = path.join(
    __dirname,
    '..',
    'visualTest',
    'fixtures',
    'baseline_black.png',
  );

  beforeAll(async () => {
    app = await TestApp.init();
    db = app.get(PrismaConnection).client;
  });

  afterAll(async () => {
    await TestApp.close();
  });

  beforeEach(async () => {
    await TestApp.resetDb();
    await TestApp.createProject('checkout');
    await TestApp.createProject('other');
    await db.user.create({
      data: {
        username: 'admin',
        passwordHash: await hashPassword('secret'),
        role: 'ADMIN',
      },
    });
    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ username: 'admin', password: 'secret' })
      .expect(200);
    adminCookie = login.get('Set-Cookie')![0].split(';')[0]!;
  }, 30_000);

  async function createKey(body: Record<string, unknown>) {
    const response = await request(app.getHttpServer())
      .post('/api/v1/api-keys')
      .set('Cookie', adminCookie)
      .send(body)
      .expect(201);
    return response.body as { id: string; rawKey: string };
  }

  function upload(key: string, project: string) {
    return request(app.getHttpServer())
      .post(`/api/v1/projects/${project}/tests/login/upload?testKind=image`)
      .set('x-api-key', key)
      .field('viewport', '1920x1080')
      .field('browser', 'Chrome')
      .field('environment', 'staging')
      .attach('file', fs.createReadStream(baseline));
  }

  it('defaults to upload-only and confines the key to its projects', async () => {
    const key = await createKey({
      name: 'ci',
      scopes: ['upload'],
      projectNames: ['checkout'],
    });

    await upload(key.rawKey, 'checkout').expect(201);
    await upload(key.rawKey, 'other').expect(403);
    await request(app.getHttpServer())
      .get('/api/v1/projects/checkout')
      .set('x-api-key', key.rawKey)
      .expect(403);
    await request(app.getHttpServer())
      .get('/api/v1/projects')
      .set('x-api-key', key.rawKey)
      .expect(403);
  });

  it('requires the read scope for reads and the upload scope for uploads', async () => {
    const reader = await createKey({ name: 'reader', scopes: ['read'] });

    await request(app.getHttpServer())
      .get('/api/v1/projects/checkout')
      .set('x-api-key', reader.rawKey)
      .expect(200);
    await upload(reader.rawKey, 'checkout').expect(403);
  });

  it('keeps scopes and the allowlist across a rotation', async () => {
    const original = await createKey({
      name: 'ci',
      scopes: ['upload'],
      projectNames: ['checkout'],
    });

    const rotated = await request(app.getHttpServer())
      .post(`/api/v1/api-keys/${original.id}/rotate`)
      .set('Cookie', adminCookie)
      .send({ graceMinutes: 0 })
      .expect(201);

    await upload(rotated.body.rawKey, 'checkout').expect(201);
    await upload(rotated.body.rawKey, 'other').expect(403);

    const list = await request(app.getHttpServer())
      .get('/api/v1/api-keys')
      .set('Cookie', adminCookie)
      .expect(200);
    const successor = list.body.find(
      (key: { id: string }) => key.id === rotated.body.id,
    );
    expect(successor).toEqual(
      expect.objectContaining({
        scopes: ['upload'],
        projectNames: ['checkout'],
        ownerUsername: 'admin',
      }),
    );
  });

  it('grants the admin role only with the admin scope', async () => {
    const adminKey = await createKey({ name: 'admin', scopes: ['admin'] });

    await request(app.getHttpServer())
      .delete('/api/v1/projects/other')
      .set('x-api-key', adminKey.rawKey)
      .expect(200);
  });

  it('keeps the audit trail unreadable for api keys', async () => {
    const adminKey = await createKey({ name: 'auditor', scopes: ['admin'] });

    // The trail names every actor and action in the deployment; an admin-scoped
    // key still must not read it, only a browser session can (ADR-035).
    await request(app.getHttpServer())
      .get('/api/v1/audit')
      .set('x-api-key', adminKey.rawKey)
      .expect(403);
  });
});
