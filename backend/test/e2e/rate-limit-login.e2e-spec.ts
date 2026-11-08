import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import request from 'supertest';
import { PrismaConnection } from '@/prisma/prisma-connection';
import { TestApp } from './_support/utils/test-app';
import { hashPassword } from '@internal/auth/password-hasher';
import { ensureRateLimitWindowRoom } from './_support/utils/rate-limit-window';

describe('Login and log rate limits (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await TestApp.init();
    await TestApp.resetDb();
    const db = app.get(PrismaConnection).client;
    await db.rateLimitBucket.deleteMany();
    await db.user.create({
      data: {
        username: 'admin',
        passwordHash: await hashPassword('secret'),
      },
    });
    // ConfigService.set wins over the validated env at read time (the rate-limit
    // values are read through AppConfigService on every request).
    app.get(ConfigService).set('LOGIN_RATE_LIMIT_PER_MINUTE', '2');
    app.get(ConfigService).set('LOG_RATE_LIMIT_PER_MINUTE', '2');
  });

  afterAll(async () => {
    app.get(ConfigService).set('LOGIN_RATE_LIMIT_PER_MINUTE', '1000');
    app.get(ConfigService).set('LOG_RATE_LIMIT_PER_MINUTE', '1000');
    const db = app.get(PrismaConnection).client;
    await db.rateLimitBucket.deleteMany();
    await TestApp.close();
  });

  it('rejects the 3rd login attempt in a minute window with 429 and Retry-After', async () => {
    await ensureRateLimitWindowRoom();
    const attempt = () =>
      request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ username: 'admin', password: 'wrong' });

    await attempt().expect(401);
    await attempt().expect(401);

    const res = await attempt().expect(429);
    expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
  });

  it('rejects the 3rd log-ingestion post in a minute window with 429 and Retry-After', async () => {
    await ensureRateLimitWindowRoom();
    const postLog = () =>
      request(app.getHttpServer()).post('/api/v1/log').send({ message: 'x' });

    await postLog().expect(204);
    await postLog().expect(204);

    const res = await postLog().expect(429);
    expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
  });
});
