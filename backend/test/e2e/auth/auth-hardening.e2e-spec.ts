import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { TestApp } from '../_support/utils/test-app';
import { PrismaConnection } from '@/prisma/prisma-connection';
import { PrismaClient } from '@/prisma/client';
import { hashPassword } from '@internal/auth/password-hasher';
import { totpCode } from '@internal/auth/totp';

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

  async function enableTwoFactor(cookie: string) {
    const setup = await request(app.getHttpServer())
      .post('/api/v1/auth/2fa/setup')
      .set('Cookie', cookie)
      .expect(200);
    const enabled = await request(app.getHttpServer())
      .post('/api/v1/auth/2fa/enable')
      .set('Cookie', cookie)
      .send({ code: totpCode(setup.body.secret) })
      .expect(200);
    return {
      secret: setup.body.secret as string,
      recoveryCodes: enabled.body.recoveryCodes as string[],
    };
  }

  it('enables TOTP, challenges login and accepts a recovery code', async () => {
    await seedAdmin();
    const first = await login();
    const cookie = cookieOf(first);
    const { secret, recoveryCodes } = await enableTwoFactor(cookie);
    expect(recoveryCodes).toHaveLength(10);

    const challenged = await login();
    expect(challenged.body.twoFactorRequired).toBe(true);
    expect(challenged.get('Set-Cookie')).toBeUndefined();

    const wrong = await request(app.getHttpServer())
      .post('/api/v1/auth/2fa/verify')
      .send({ challengeToken: challenged.body.challengeToken, code: '000000' })
      .expect(401);
    expect(wrong.body.message).toBeDefined();

    const verified = await request(app.getHttpServer())
      .post('/api/v1/auth/2fa/verify')
      .send({
        challengeToken: challenged.body.challengeToken,
        code: totpCode(secret),
      })
      .expect(200);
    expect(verified.body.role).toBe('ADMIN');
    expect(verified.get('Set-Cookie')!.length).toBeGreaterThan(0);

    const recoveryChallenge = await login();
    await request(app.getHttpServer())
      .post('/api/v1/auth/2fa/verify')
      .send({
        challengeToken: recoveryChallenge.body.challengeToken,
        code: recoveryCodes[0],
      })
      .expect(200);

    const replayChallenge = await login();
    await request(app.getHttpServer())
      .post('/api/v1/auth/2fa/verify')
      .send({
        challengeToken: replayChallenge.body.challengeToken,
        code: recoveryCodes[0],
      })
      .expect(401);
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

  it('disables TOTP with the password and logs in without a challenge', async () => {
    await seedAdmin();
    const first = await login();
    const cookie = cookieOf(first);
    await enableTwoFactor(cookie);

    await request(app.getHttpServer())
      .post('/api/v1/auth/2fa/disable')
      .set('Cookie', cookie)
      .send({ password: 'wrong' })
      .expect(401);
    await request(app.getHttpServer())
      .post('/api/v1/auth/2fa/disable')
      .set('Cookie', cookie)
      .send({ password: 'secret' })
      .expect(204);

    const direct = await login();
    expect(direct.body.twoFactorRequired).toBeUndefined();
    expect(direct.body.role).toBe('ADMIN');
    expect(direct.get('Set-Cookie')).toBeDefined();
  });
});
