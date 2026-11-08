import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { TestApp } from '../_support/utils/test-app';
import { PrismaConnection } from '@/prisma/prisma-connection';
import { PrismaClient } from '@/prisma/client';
import { hashPassword } from '@internal/auth/password-hasher';

describe('Auth hardening (e2e)', () => {
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

  async function seedAdmin() {
    return db.user.create({
      data: {
        username: 'admin',
        passwordHash: await hashPassword('secret'),
        role: 'ADMIN',
        isActive: true,
      },
    });
  }

  async function login() {
    return request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ username: 'admin', password: 'secret' })
      .expect(200);
  }

  function cookieOf(response: request.Response): string {
    return response.get('Set-Cookie')![0].split(';')[0]!;
  }

  it('changing the password revokes every other session', async () => {
    await seedAdmin();
    const first = await login();
    const second = await login();
    const firstCookie = cookieOf(first);
    const secondCookie = cookieOf(second);

    await request(app.getHttpServer())
      .post('/api/v1/auth/change-password')
      .set('Cookie', firstCookie)
      .send({ currentPassword: 'secret', newPassword: 'new-secret' })
      .expect(200);

    await request(app.getHttpServer())
      .get('/api/v1/projects')
      .set('Cookie', secondCookie)
      .expect(401);
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ username: 'admin', password: 'secret' })
      .expect(401);
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ username: 'admin', password: 'new-secret' })
      .expect(200);
  });

  it('lists sessions, revokes one and keeps the current on revoke-all', async () => {
    await seedAdmin();
    const first = await login();
    const second = await login();
    const firstCookie = cookieOf(first);
    const secondCookie = cookieOf(second);

    const list = await request(app.getHttpServer())
      .get('/api/v1/auth/sessions')
      .set('Cookie', firstCookie)
      .expect(200);
    expect(list.body).toHaveLength(2);
    expect(
      list.body.filter((session: { isCurrent: boolean }) => session.isCurrent),
    ).toHaveLength(1);
    const other = list.body.find(
      (session: { isCurrent: boolean }) => !session.isCurrent,
    );

    await request(app.getHttpServer())
      .delete(`/api/v1/auth/sessions/${other.id}`)
      .set('Cookie', firstCookie)
      .expect(204);
    await request(app.getHttpServer())
      .get('/api/v1/projects')
      .set('Cookie', secondCookie)
      .expect(401);

    const remaining = await request(app.getHttpServer())
      .get('/api/v1/auth/sessions')
      .set('Cookie', firstCookie)
      .expect(200);
    expect(remaining.body).toHaveLength(1);

    await request(app.getHttpServer())
      .post('/api/v1/auth/sessions/revoke-all')
      .set('Cookie', firstCookie)
      .expect(200);
    await request(app.getHttpServer())
      .get('/api/v1/projects')
      .set('Cookie', firstCookie)
      .expect(200);
  });
});
