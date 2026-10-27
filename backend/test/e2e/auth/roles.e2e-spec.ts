import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { TestApp } from '../_support/utils/test-app';
import { PrismaConnection } from '@/prisma/prisma-connection';
import { PrismaClient } from '@/prisma/client';
import { hashPassword } from '@internal/auth/password-hasher';

describe('Roles and users (e2e)', () => {
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

  async function seed(username: string, role: 'ADMIN' | 'MEMBER' | 'VIEWER') {
    return db.user.create({
      data: {
        username,
        passwordHash: await hashPassword('secret'),
        role,
        isActive: true,
      },
    });
  }

  async function login(username: string, password = 'secret') {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ username, password })
      .expect(200);
    return {
      cookie: response.get('Set-Cookie')![0].split(';')[0],
      body: response.body,
    };
  }

  it('reports the role on login and /auth/me', async () => {
    await seed('viewer', 'VIEWER');
    const { cookie, body } = await login('viewer');

    expect(body.role).toBe('VIEWER');
    const me = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Cookie', cookie)
      .expect(200);
    expect(me.body).toEqual(
      expect.objectContaining({ role: 'VIEWER', mustChangePassword: false }),
    );
  });

  it('gives a viewer reads but no writes', async () => {
    await seed('viewer', 'VIEWER');
    const { cookie } = await login('viewer');

    await request(app.getHttpServer())
      .get('/api/v1/projects')
      .set('Cookie', cookie)
      .expect(200);

    await request(app.getHttpServer())
      .post('/api/v1/projects')
      .set('Cookie', cookie)
      .send({ name: 'nope' })
      .expect(403);

    await request(app.getHttpServer())
      .delete('/api/v1/projects/anything')
      .set('Cookie', cookie)
      .expect(403);
  });

  it('keeps users and api keys admin-only', async () => {
    await seed('member', 'MEMBER');
    await seed('admin', 'ADMIN');
    const member = await login('member');
    const admin = await login('admin');

    await request(app.getHttpServer())
      .get('/api/v1/users')
      .set('Cookie', member.cookie)
      .expect(403);
    await request(app.getHttpServer())
      .post('/api/v1/api-keys')
      .set('Cookie', member.cookie)
      .send({ name: 'nope' })
      .expect(403);

    await request(app.getHttpServer())
      .get('/api/v1/users')
      .set('Cookie', admin.cookie)
      .expect(200);
    await request(app.getHttpServer())
      .delete('/api/v1/projects/anything')
      .set('Cookie', admin.cookie)
      .expect(404);
  });

  it('forces a temporary password to be changed before other routes', async () => {
    await seed('admin', 'ADMIN');
    const admin = await login('admin');

    const created = await request(app.getHttpServer())
      .post('/api/v1/users')
      .set('Cookie', admin.cookie)
      .send({ username: 'newbie', role: 'MEMBER' })
      .expect(201);
    const temporaryPassword = created.body.temporaryPassword;
    expect(temporaryPassword).toEqual(expect.any(String));

    const newbie = await login('newbie', temporaryPassword);
    expect(newbie.body.mustChangePassword).toBe(true);
    await request(app.getHttpServer())
      .get('/api/v1/projects')
      .set('Cookie', newbie.cookie)
      .expect(403);

    const changed = await request(app.getHttpServer())
      .post('/api/v1/auth/change-password')
      .set('Cookie', newbie.cookie)
      .send({ currentPassword: temporaryPassword, newPassword: 'new-secret' })
      .expect(200);
    expect(changed.body.mustChangePassword).toBe(false);
    const newCookie = changed.get('Set-Cookie')![0].split(';')[0];

    await request(app.getHttpServer())
      .get('/api/v1/projects')
      .set('Cookie', newCookie)
      .expect(200);
  });

  it('applies a role change without re-login and audits it', async () => {
    await seed('admin', 'ADMIN');
    const target = await seed('member', 'MEMBER');
    const admin = await login('admin');
    const member = await login('member');

    await request(app.getHttpServer())
      .post('/api/v1/projects')
      .set('Cookie', member.cookie)
      .send({ name: 'allowed' })
      .expect(201);

    await request(app.getHttpServer())
      .patch(`/api/v1/users/${target.id}`)
      .set('Cookie', admin.cookie)
      .send({ role: 'VIEWER' })
      .expect(200);

    await request(app.getHttpServer())
      .post('/api/v1/projects')
      .set('Cookie', member.cookie)
      .send({ name: 'now-forbidden' })
      .expect(403);

    const audit = await request(app.getHttpServer())
      .get('/api/v1/audit?action=user.update')
      .set('Cookie', admin.cookie)
      .expect(200);
    expect(audit.body.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: 'user.update',
          targetId: target.id,
        }),
      ]),
    );
  });

  it('invalidates live sessions when a user is deactivated', async () => {
    await seed('admin', 'ADMIN');
    const target = await seed('member', 'MEMBER');
    const admin = await login('admin');
    const member = await login('member');

    await request(app.getHttpServer())
      .patch(`/api/v1/users/${target.id}`)
      .set('Cookie', admin.cookie)
      .send({ isActive: false })
      .expect(200);

    await request(app.getHttpServer())
      .get('/api/v1/projects')
      .set('Cookie', member.cookie)
      .expect(401);
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ username: 'member', password: 'secret' })
      .expect(401);
  });

  it('revokes the api keys a deactivated user owns', async () => {
    await seed('admin', 'ADMIN');
    const target = await seed('member', 'MEMBER');
    const admin = await login('admin');

    // Key management is ADMIN-owned, so the key is minted by the admin and then
    // attributed to the member: ownership is what deactivation has to sever.
    const created = await request(app.getHttpServer())
      .post('/api/v1/api-keys')
      .set('Cookie', admin.cookie)
      .send({ name: 'member-key', scopes: ['read'] })
      .expect(201);
    const rawKey = created.body.rawKey as string;
    await db.apiKey.update({
      where: { id: created.body.id },
      data: { ownerId: target.id },
    });

    await request(app.getHttpServer())
      .get('/api/v1/projects')
      .set('x-api-key', rawKey)
      .expect(200);

    await request(app.getHttpServer())
      .patch(`/api/v1/users/${target.id}`)
      .set('Cookie', admin.cookie)
      .send({ isActive: false })
      .expect(200);

    // A key is a long-lived credential: deactivation has to kill it too, not
    // just the sessions.
    await request(app.getHttpServer())
      .get('/api/v1/projects')
      .set('x-api-key', rawKey)
      .expect(401);

    await expect(
      db.apiKey.findFirst({ where: { ownerId: target.id } }),
    ).resolves.toEqual(
      expect.objectContaining({ revokedReason: 'owner-deactivated' }),
    );
  });

  it('revokes sessions on a password reset', async () => {
    await seed('admin', 'ADMIN');
    const target = await seed('member', 'MEMBER');
    const admin = await login('admin');
    const member = await login('member');

    const reset = await request(app.getHttpServer())
      .post(`/api/v1/users/${target.id}/reset-password`)
      .set('Cookie', admin.cookie)
      .expect(200);
    expect(reset.body.temporaryPassword).toEqual(expect.any(String));

    await request(app.getHttpServer())
      .get('/api/v1/projects')
      .set('Cookie', member.cookie)
      .expect(401);
  });
});
