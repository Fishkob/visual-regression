import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { TestApp } from '../_support/utils/test-app';
import { authRequest } from '../_support/utils/authenticated-request';
import { PrismaConnection } from '@/prisma/prisma-connection';
import type { PrismaClient } from '@/prisma/client';
import { hashPassword } from '@internal/auth/password-hasher';

interface CreatedUser {
  user: { id: string; username: string; role: string; createdBy: string };
  invite: { token: string; expiresAt: string };
}

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

  async function createUser(
    username: string,
    role: 'ADMIN' | 'MEMBER',
  ): Promise<CreatedUser> {
    const response = await request(app.getHttpServer())
      .post('/api/v1/users')
      .set('Cookie', cookie)
      .send({ username, role })
      .expect(201);
    return response.body as CreatedUser;
  }

  // The unauthenticated half of the flow: whoever holds the link turns it into
  // the temporary password, exactly once.
  async function revealInvite(token: string) {
    const response = await request(app.getHttpServer())
      .post(`/api/v1/public/user-invites/${token}/reveal`)
      .expect(200);
    return response.body as { username: string; temporaryPassword: string };
  }

  function patchUser(id: string, body: Record<string, unknown>) {
    return request(app.getHttpServer())
      .patch(`/api/v1/users/${id}`)
      .set('Cookie', cookie)
      .send(body);
  }

  it('lists the admins and creates a member whose password is only in the link', async () => {
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
    // The admin never sees the password: the answer carries the link, not the
    // credential it will reveal.
    expect(created.invite.token).toEqual(expect.any(String));
    expect(created.invite.expiresAt).toEqual(expect.any(String));
    expect(created).not.toHaveProperty('temporaryPassword');
    expect(JSON.stringify(created)).not.toContain('temporaryPassword');

    const preview = await request(app.getHttpServer())
      .get(`/api/v1/public/user-invites/${created.invite.token}`)
      .expect(200);
    expect(preview.body).toEqual({
      username: 'newbie',
      role: 'MEMBER',
      expiresAt: created.invite.expiresAt,
      status: 'pending',
    });

    const revealed = await revealInvite(created.invite.token);
    expect(revealed.username).toBe('newbie');
    expect(revealed.temporaryPassword).toEqual(expect.any(String));

    // The one-time password authenticates, but only the password-change surface
    // is reachable until it has been replaced.
    const temporary = await login('newbie', revealed.temporaryPassword);
    await request(app.getHttpServer())
      .get('/api/v1/projects')
      .set('Cookie', temporary)
      .expect(403);

    const changed = await request(app.getHttpServer())
      .post('/api/v1/auth/change-password')
      .set('Cookie', temporary)
      .send({
        currentPassword: revealed.temporaryPassword,
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

    // The reveal is its own audit entry with no actor: nobody was signed in.
    const reveals = await db.auditEvent.findMany({
      where: { action: 'user.invite-redeem', targetId: created.user.id },
    });
    expect(reveals).toHaveLength(1);
    expect(reveals[0]!.actor).toBeNull();
  });

  it('consumes an invite link on the first reveal and answers 410 afterwards', async () => {
    const created = await createUser('once', 'MEMBER');

    // Opening the link (the preview) must not use it up: chat clients and mail
    // scanners fetch links before the human does.
    await request(app.getHttpServer())
      .get(`/api/v1/public/user-invites/${created.invite.token}`)
      .expect(200);
    await request(app.getHttpServer())
      .get(`/api/v1/public/user-invites/${created.invite.token}`)
      .expect(200);

    const revealed = await revealInvite(created.invite.token);

    const second = await request(app.getHttpServer())
      .post(`/api/v1/public/user-invites/${created.invite.token}/reveal`)
      .expect(410);
    expect(second.body.message).toBe('The invite link has already been used');

    // The consumed link still previews, so the page can explain itself instead
    // of pretending the link never existed.
    const preview = await request(app.getHttpServer())
      .get(`/api/v1/public/user-invites/${created.invite.token}`)
      .expect(200);
    expect(preview.body.status).toBe('used');

    // What the link handed out is a working credential.
    await login('once', revealed.temporaryPassword);
  });

  it('answers 404 for an unknown invite token', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/public/user-invites/not-a-token')
      .expect(404);
    await request(app.getHttpServer())
      .post('/api/v1/public/user-invites/not-a-token/reveal')
      .expect(404);
  });

  it('refuses an expired invite link', async () => {
    const created = await createUser('slow', 'MEMBER');
    await db.userInvite.updateMany({
      where: { userId: created.user.id },
      data: { expiresAt: new Date(Date.now() - 1_000) },
    });

    const preview = await request(app.getHttpServer())
      .get(`/api/v1/public/user-invites/${created.invite.token}`)
      .expect(200);
    expect(preview.body.status).toBe('expired');

    const reveal = await request(app.getHttpServer())
      .post(`/api/v1/public/user-invites/${created.invite.token}/reveal`)
      .expect(410);
    expect(reveal.body.message).toBe('The invite link has expired');
  });

  it('stops revealing once the user has changed the password the link carried', async () => {
    const created = await createUser('changed', 'MEMBER');
    const revealed = await revealInvite(created.invite.token);
    const session = await login('changed', revealed.temporaryPassword);
    await request(app.getHttpServer())
      .post('/api/v1/auth/change-password')
      .set('Cookie', session)
      .send({
        currentPassword: revealed.temporaryPassword,
        newPassword: 'changed-for-good',
      })
      .expect(200);

    // A link that was revealed before the change is used; the password it names
    // is gone either way.
    await request(app.getHttpServer())
      .post(`/api/v1/public/user-invites/${created.invite.token}/reveal`)
      .expect(410);
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        username: 'changed',
        password: revealed.temporaryPassword,
      })
      .expect(401);
  });

  it('replaces the outstanding link on every password reset', async () => {
    const created = await createUser('forgetful', 'MEMBER');

    const first = await request(app.getHttpServer())
      .post(`/api/v1/users/${created.user.id}/reset-password`)
      .set('Cookie', cookie)
      .expect(200);
    expect(first.body.invite.token).toEqual(expect.any(String));
    expect(first.body).not.toHaveProperty('temporaryPassword');

    const firstRevealed = await revealInvite(first.body.invite.token);
    const temporary = await login('forgetful', firstRevealed.temporaryPassword);
    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Cookie', temporary)
      .expect(200);

    const second = await request(app.getHttpServer())
      .post(`/api/v1/users/${created.user.id}/reset-password`)
      .set('Cookie', cookie)
      .expect(200);
    expect(second.body.invite.token).not.toBe(first.body.invite.token);

    // The superseded link is gone, not merely stale: one invite per account.
    await request(app.getHttpServer())
      .get(`/api/v1/public/user-invites/${first.body.invite.token}`)
      .expect(404);
    await request(app.getHttpServer())
      .get(`/api/v1/public/user-invites/${created.invite.token}`)
      .expect(404);

    // The session minted by the first reset is gone with the second reset.
    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Cookie', temporary)
      .expect(401);

    const secondRevealed = await revealInvite(second.body.invite.token);
    expect(secondRevealed.temporaryPassword).not.toBe(
      firstRevealed.temporaryPassword,
    );
    await login('forgetful', secondRevealed.temporaryPassword);

    const audit = await db.auditEvent.findMany({
      where: { action: 'user.reset-password', targetId: created.user.id },
    });
    expect(audit).toHaveLength(2);
  });

  it('promotes and demotes a user without a re-login', async () => {
    const created = await createUser('reviewer', 'MEMBER');
    const revealed = await revealInvite(created.invite.token);
    const reviewer = await login('reviewer', revealed.temporaryPassword);
    const changed = await request(app.getHttpServer())
      .post('/api/v1/auth/change-password')
      .set('Cookie', reviewer)
      .send({
        currentPassword: revealed.temporaryPassword,
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
    const revealed = await revealInvite(created.invite.token);
    await login('temp', revealed.temporaryPassword);
    await expect(
      db.session.count({ where: { userId: created.user.id } }),
    ).resolves.toBe(1);
    const session = await login('temp', revealed.temporaryPassword);

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
      .send({ username: 'temp', password: revealed.temporaryPassword })
      .expect(401);

    const reactivated = await patchUser(created.user.id, {
      isActive: true,
    }).expect(200);
    expect(reactivated.body).toEqual(
      expect.objectContaining({ isActive: true, deactivatedAt: null }),
    );

    const again = await login('temp', revealed.temporaryPassword);
    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Cookie', again)
      .expect(200);
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
