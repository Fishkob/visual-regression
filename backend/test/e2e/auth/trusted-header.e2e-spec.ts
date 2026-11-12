import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { TestApp } from '../_support/utils/test-app';
import { PrismaConnection } from '@/prisma/prisma-connection';
import { PrismaClient } from '@/prisma/client';
import { hashPassword } from '@internal/auth/password-hasher';
import { E2E_API_KEY } from '../_support/utils/e2e-api-key';

// The header is read by the config seam when AppModule is imported, so it has to
// be set before the imports above — vi.hoisted is the one hook that runs that
// early. This file is the one place the path is switched on; every other spec
// runs without AUTH_TRUSTED_HEADER, where a header must stay meaningless.
const HEADER = vi.hoisted(() => {
  process.env.AUTH_TRUSTED_HEADER = 'x-auth-request-user';
  return 'x-auth-request-user';
});

describe('Trusted-header auth (e2e)', () => {
  let app: INestApplication;
  let db: PrismaClient;

  beforeAll(async () => {
    app = await TestApp.init();
    db = app.get(PrismaConnection).client;
  });

  afterAll(async () => {
    await TestApp.close();
    delete process.env.AUTH_TRUSTED_HEADER;
  });

  beforeEach(async () => {
    await TestApp.resetDb();
  }, 30_000);

  async function seedUser(
    username: string,
    role: 'ADMIN' | 'MEMBER' | 'VIEWER',
    isActive = true,
  ) {
    return db.user.create({
      data: {
        username,
        passwordHash: await hashPassword('secret'),
        role,
        isActive,
      },
    });
  }

  it('authenticates the user its proxy named, with that user role', async () => {
    await seedUser('alice', 'MEMBER');

    const me = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set(HEADER, 'alice')
      .expect(200);

    expect(me.body).toEqual({
      username: 'alice',
      role: 'MEMBER',
      mustChangePassword: false,
    });

    // A read on a product route proves the identity reaches the product API,
    // not just the account endpoint.
    await request(app.getHttpServer())
      .get('/api/v1/projects')
      .set(HEADER, 'alice')
      .expect(200);
  });

  it('rejects a header that names nobody active', async () => {
    await seedUser('mallory', 'MEMBER', false);

    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set(HEADER, 'mallory')
      .expect(401);
    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set(HEADER, 'nobody')
      .expect(401);
  });

  it('keeps an api key ahead of the proxy identity', async () => {
    await seedUser('alice', 'ADMIN');

    const me = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('x-api-key', E2E_API_KEY)
      .set(HEADER, 'alice')
      .expect(200);

    // The key's own name, not the human's: a proxy that stamps the header on
    // every request must not silently widen a restricted key.
    expect(me.body.username).toBe('e2e');
  });

  it('applies the viewer write ban to a proxy identity', async () => {
    await seedUser('vera', 'VIEWER');

    await request(app.getHttpServer())
      .get('/api/v1/projects')
      .set(HEADER, 'vera')
      .expect(200);
    await request(app.getHttpServer())
      .post('/api/v1/projects')
      .set(HEADER, 'vera')
      .send({ name: 'project-by-viewer' })
      .expect(403);
  });

  it('rejects a cross-site write that arrived through the proxy', async () => {
    await seedUser('alice', 'ADMIN');

    await request(app.getHttpServer())
      .post('/api/v1/projects')
      .set(HEADER, 'alice')
      .set('sec-fetch-site', 'cross-site')
      .send({ name: 'project-by-csrf' })
      .expect(403);
  });
});
