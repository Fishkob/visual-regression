import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { TestApp } from '../_support/utils/test-app';
import { authRequest } from '../_support/utils/authenticated-request';
import { PrismaConnection } from '@/prisma/prisma-connection';
import type { PrismaClient } from '@/prisma/client';
import { hashPassword } from '@internal/auth/password-hasher';

describe('Users administration (e2e)', () => {
  let app: INestApplication;
  let db: PrismaClient;
  let cookie: string;
  let rootId: string;

  beforeAll(async () => {
    app = await TestApp.init();
    db = app.get(PrismaConnection).client;
  });

  beforeEach(async () => {
    await TestApp.resetDb();
    const root = await db.user.create({
      data: {
        username: 'root',
        passwordHash: await hashPassword('secret'),
        role: 'ADMIN',
      },
    });
    rootId = root.id;
    cookie = await login('root');
  }, 30_000);

  afterAll(async () => {
    await TestApp.close();
  });

  async function login(username: string, password = 'secret') {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ username, password })
      .expect(200);
    return response.get('Set-Cookie')![0]!.split(';')[0]!;
  }

  async function createUser(username: string, role: 'ADMIN' | 'MEMBER') {
    const response = await request(app.getHttpServer())
      .post('/api/v1/users')
      .set('Cookie', cookie)
      .send({ username, role })
      .expect(201);
    return response.body as {
      user: { id: string; username: string; role: string; createdBy: string };
      temporaryPassword: string;
    };
  }

  function patchUser(id: string, body: Record<string, unknown>) {
    return request(app.getHttpServer())
      .patch(`/api/v1/users/${id}`)
      .set('Cookie', cookie)
      .send(body);
  }

  it('lists the admins and creates a member with a temporary password', async () => {
    const list = await request(app.getHttpServer())
      .get('/api/v1/users')
      .set('Cookie', cookie)
      .expect(200);
    expect(list.body).toEqual([
      expect.objectContaining({
        id: rootId,
        username: 'root',
        role: 'ADMIN',
        isActive: true,
        mustChangePassword: false,
      }),
    ]);
    expect(list.body[0].passwordHash).toBeUndefined();

    const created = await createUser('newbie', 'MEMBER');
    expect(created.user).toEqual(
      expect.objectContaining({
        username: 'newbie',
        role: 'MEMBER',
        isActive: true,
        mustChangePassword: true,
        createdBy: 'root',
      }),
    );
    expect(created.temporaryPassword).toEqual(expect.any(String));

    // The one-time password authenticates, but only the password-change surface
    // is reachable until it has been replaced.
    const temporary = await login('newbie', created.temporaryPassword);
    await request(app.getHttpServer())
      .get('/api/v1/projects')
      .set('Cookie', temporary)
      .expect(403);

    const changed = await request(app.getHttpServer())
      .post('/api/v1/auth/change-password')
      .set('Cookie', temporary)
      .send({
        currentPassword: created.temporaryPassword,
        newPassword: 'brand-new-secret',
      })
      .expect(200);
    expect(changed.body.mustChangePassword).toBe(false);

    const afterChange = changed.get('Set-Cookie')![0]!.split(';')[0]!;
    await request(app.getHttpServer())
      .get('/api/v1/projects')
      .set('Cookie', afterChange)
      .expect(200);

    const audit = await db.auditEvent.findMany({
      where: { action: 'user.create', targetId: created.user.id },
    });
    expect(audit).toHaveLength(1);
    expect(audit[0]!.metadata).toEqual(
      expect.objectContaining({ username: 'newbie', role: 'MEMBER' }),
    );
  });

  it('promotes and demotes a user without a re-login', async () => {
    const created = await createUser('reviewer', 'MEMBER');
    const reviewer = await login('reviewer', created.temporaryPassword);
    const changed = await request(app.getHttpServer())
      .post('/api/v1/auth/change-password')
      .set('Cookie', reviewer)
      .send({
        currentPassword: created.temporaryPassword,
        newPassword: 'reviewer-secret',
      })
      .expect(200);
    const reviewerCookie = changed.get('Set-Cookie')![0]!.split(';')[0]!;

    await request(app.getHttpServer())
      .get('/api/v1/users')
      .set('Cookie', reviewerCookie)
      .expect(403);

    const promoted = await patchUser(created.user.id, { role: 'ADMIN' }).expect(
      200,
    );
    expect(promoted.body.role).toBe('ADMIN');
    await request(app.getHttpServer())
      .get('/api/v1/users')
      .set('Cookie', reviewerCookie)
      .expect(200);

    const demoted = await patchUser(created.user.id, { role: 'MEMBER' }).expect(
      200,
    );
    expect(demoted.body.role).toBe('MEMBER');
    await request(app.getHttpServer())
      .get('/api/v1/users')
      .set('Cookie', reviewerCookie)
      .expect(403);

    const audit = await db.auditEvent.findMany({
      where: { action: 'user.update', targetId: created.user.id },
      orderBy: { createdAt: 'asc' },
    });
    expect(audit).toHaveLength(2);
    expect(audit[0]!.metadata).toEqual(
      expect.objectContaining({ role: 'ADMIN' }),
    );
  });

  it('deactivates a user, drops their sessions and lets a reactivation log in again', async () => {
    const created = await createUser('temp', 'MEMBER');
    await login('temp', created.temporaryPassword);
    await expect(
      db.session.count({ where: { userId: created.user.id } }),
    ).resolves.toBe(1);
    const session = await login('temp', created.temporaryPassword);

    const deactivated = await patchUser(created.user.id, {
      isActive: false,
    }).expect(200);
    expect(deactivated.body).toEqual(
      expect.objectContaining({
        isActive: false,
        deactivatedAt: expect.any(String),
      }),
    );

    await expect(
      db.session.count({ where: { userId: created.user.id } }),
    ).resolves.toBe(0);

    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Cookie', session)
      .expect(401);
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ username: 'temp', password: created.temporaryPassword })
      .expect(401);

    const reactivated = await patchUser(created.user.id, {
      isActive: true,
    }).expect(200);
    expect(reactivated.body).toEqual(
      expect.objectContaining({ isActive: true, deactivatedAt: null }),
    );

    const again = await login('temp', created.temporaryPassword);
    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Cookie', again)
      .expect(200);
  });

  it('resets a password to a fresh one-time value and revokes the sessions', async () => {
    const created = await createUser('forgetful', 'MEMBER');
    const first = await request(app.getHttpServer())
      .post(`/api/v1/users/${created.user.id}/reset-password`)
      .set('Cookie', cookie)
      .expect(200);
    expect(first.body.temporaryPassword).toEqual(expect.any(String));

    const temporary = await login('forgetful', first.body.temporaryPassword);
    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Cookie', temporary)
      .expect(200);

    const second = await request(app.getHttpServer())
      .post(`/api/v1/users/${created.user.id}/reset-password`)
      .set('Cookie', cookie)
      .expect(200);
    expect(second.body.temporaryPassword).toEqual(expect.any(String));
    expect(second.body.temporaryPassword).not.toBe(
      first.body.temporaryPassword,
    );

    // The session minted by the first reset is gone with the second reset.
    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Cookie', temporary)
      .expect(401);

    const audit = await db.auditEvent.findMany({
      where: { action: 'user.reset-password', targetId: created.user.id },
    });
    expect(audit).toHaveLength(2);
  });

  it('protects the last active admin from demotion and deactivation', async () => {
    const demoted = await patchUser(rootId, { role: 'MEMBER' }).expect(409);
    expect(demoted.body.message).toBe(
      'The last active admin cannot be removed',
    );

    const deactivated = await patchUser(rootId, { isActive: false }).expect(
      409,
    );
    expect(deactivated.body.message).toBe(
      'The last active admin cannot be removed',
    );

    // A second admin makes the demotion legal; once it is deactivated the
    // remaining admin is protected again.
    const backup = await createUser('backup', 'ADMIN');
    await patchUser(backup.user.id, { isActive: false }).expect(200);
    await patchUser(rootId, { role: 'MEMBER' }).expect(409);

    await patchUser(backup.user.id, { isActive: true }).expect(200);
    const nowLegal = await patchUser(rootId, { role: 'MEMBER' }).expect(200);
    expect(nowLegal.body.role).toBe('MEMBER');
  });

  it('answers 404 for an unknown user and keeps the surface admin-only', async () => {
    await patchUser('missing', { role: 'MEMBER' }).expect(404);
    await request(app.getHttpServer())
      .post('/api/v1/users/missing/reset-password')
      .set('Cookie', cookie)
      .expect(404);

    // An admin-scoped api key still cannot manage users: the surface is for
    // browser sessions (a leaked CI key must not mint accounts).
    await authRequest(app).get('/api/v1/users').expect(403);
    await authRequest(app)
      .post('/api/v1/users')
      .send({ username: 'via-key', role: 'ADMIN' })
      .expect(403);
  });
});
