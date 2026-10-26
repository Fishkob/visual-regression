import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { TestApp } from '../_support/utils/test-app';
import { PrismaConnection } from '@/prisma/prisma-connection';
import { PrismaClient } from '@/prisma/client';
import { E2E_API_KEY } from '../_support/utils/e2e-api-key';
import { hashPassword } from '@internal/auth/password-hasher';

// The TestApp e2e app bypasses main.ts, so bootstrapAdmin does not run — each
// test that needs a user seeds one directly via Prisma.
describe('Auth (e2e)', () => {
  let app: INestApplication;
  let db: PrismaClient;

  beforeAll(async () => {
    app = await TestApp.init();
    db = app.get(PrismaConnection).client;
  });

  afterAll(async () => {
    await TestApp.close();
  });

  beforeEach(async () => {
    await TestApp.resetDb();
  }, 30_000);

  it('rejects a protected endpoint without credentials', async () => {
    await request(app.getHttpServer()).get('/api/v1/projects').expect(401);
  });

  it('accepts the api key on a protected endpoint', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/projects')
      .set('x-api-key', E2E_API_KEY)
      .expect(200);
  });

  it('keeps health public', async () => {
    await request(app.getHttpServer()).get('/api/v1/health').expect(200);
  });

  it('keeps metrics behind the metrics api key', async () => {
    await request(app.getHttpServer()).get('/api/v1/metrics').expect(401);
    await request(app.getHttpServer())
      .get('/api/v1/metrics')
      .set('x-metrics-key', process.env.METRICS_API_KEY ?? 'test-metrics-key')
      .expect(200);
  });

  it('creates an api key with only the admin key (no product credential)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/admin/api-keys')
      .set('Content-Type', 'application/json')
      .set('x-admin-key', process.env.ADMIN_API_KEY ?? 'test-admin-key')
      .send({ name: 'ci-e2e-seed' })
      .expect(201);

    expect(res.body).toEqual(
      expect.objectContaining({
        id: expect.any(String),
        rawKey: expect.any(String),
      }),
    );
  });

  it('rejects the admin api-key endpoint without the admin key', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/admin/api-keys')
      .set('Content-Type', 'application/json')
      .send({ name: 'nope' })
      .expect(401);
  });

  it('keeps the dlq admin endpoint behind the admin key only', async () => {
    await request(app.getHttpServer()).get('/api/v1/admin/dlq').expect(401);
    await request(app.getHttpServer())
      .get('/api/v1/admin/dlq')
      .set('x-admin-key', process.env.ADMIN_API_KEY ?? 'test-admin-key')
      .expect(200);
  });

  it('logs in with a seeded user and gets a session cookie', async () => {
    await db.user.create({
      data: {
        username: 'admin',
        passwordHash: await hashPassword('secret'),
      },
    });

    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ username: 'admin', password: 'secret' })
      .expect(200);

    const setCookie = res.get('Set-Cookie');
    expect(setCookie).toBeDefined();
    expect(setCookie![0]).toContain('vrt_session');
    expect(setCookie![0]).toContain('HttpOnly');
    expect(setCookie![0]).toContain('SameSite=Lax');
  });

  it('rejects an unknown user', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ username: 'nobody', password: 'x' })
      .expect(401);
  });

  it('rejects a wrong password', async () => {
    await db.user.create({
      data: {
        username: 'admin',
        passwordHash: await hashPassword('secret'),
      },
    });
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ username: 'admin', password: 'wrong' })
      .expect(401);
  });

  it('uses the session cookie to access a protected endpoint', async () => {
    await db.user.create({
      data: {
        username: 'admin',
        passwordHash: await hashPassword('secret'),
      },
    });
    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ username: 'admin', password: 'secret' })
      .expect(200);
    const cookie = login.get('Set-Cookie')![0].split(';')[0];

    await request(app.getHttpServer())
      .get('/api/v1/projects')
      .set('Cookie', cookie)
      .expect(200);
  });

  it('returns the current user via me', async () => {
    await db.user.create({
      data: {
        username: 'admin',
        passwordHash: await hashPassword('secret'),
      },
    });
    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ username: 'admin', password: 'secret' })
      .expect(200);
    const cookie = login.get('Set-Cookie')![0].split(';')[0];

    const res = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Cookie', cookie)
      .expect(200);

    // The read carries the caller's role and the two states the UI gates on
    // (R9 auth hardening); a user created without a role is a MEMBER.
    expect(res.body).toEqual({
      username: 'admin',
      role: 'MEMBER',
      mustChangePassword: false,
      totpEnabled: false,
    });
  });

  it('logs out and the session cookie stops working', async () => {
    await db.user.create({
      data: {
        username: 'admin',
        passwordHash: await hashPassword('secret'),
      },
    });
    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ username: 'admin', password: 'secret' })
      .expect(200);
    const cookie = login.get('Set-Cookie')![0].split(';')[0];

    await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .set('Cookie', cookie)
      .expect(204);

    await request(app.getHttpServer())
      .get('/api/v1/projects')
      .set('Cookie', cookie)
      .expect(401);
  });
});
