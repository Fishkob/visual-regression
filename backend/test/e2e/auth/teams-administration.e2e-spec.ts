import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { TestApp } from '../_support/utils/test-app';
import { authRequest } from '../_support/utils/authenticated-request';
import { PrismaConnection } from '@/prisma/prisma-connection';
import type { PrismaClient } from '@/prisma/client';
import { hashPassword } from '@internal/auth/password-hasher';

interface TeamBody {
  id: string;
  name: string;
  createdBy: string | null;
  members: { userId: string; username: string; role: string }[];
  projects: { id: string; name: string }[];
}

// Team administration is the access-granting surface (ADR-082): it is
// session-only, admin-only and audited. What this suite pins is that gate, the
// RESTRICT that keeps a team's products from silently becoming shared, and the
// `/auth/me` answer a member reads.
describe('Team administration (e2e)', () => {
  let app: INestApplication;
  let db: PrismaClient;
  let adminCookie: string;
  let memberCookie: string;
  let viewerCookie: string;
  let memberId: string;

  beforeAll(async () => {
    app = await TestApp.init();
    db = app.get(PrismaConnection).client;
  });

  afterAll(async () => {
    await TestApp.close();
  });

  beforeEach(async () => {
    await TestApp.resetDb();
    // A project always has an owner (ADR-083), so the fixture needs one before
    // it can create any project. `Base` is what both projects start on; a test
    // that moves one names the team it moves to.
    const base = await db.team.create({ data: { name: 'Base' } });
    await TestApp.createProject('checkout-ui', { teamId: base.id });
    await db.project.create({ data: { name: 'billing-api', teamId: base.id } });

    await db.user.create({
      data: {
        username: 'admin',
        passwordHash: await hashPassword('secret'),
        role: 'ADMIN',
      },
    });
    const member = await db.user.create({
      data: {
        username: 'member',
        passwordHash: await hashPassword('secret'),
        role: 'MEMBER',
      },
    });
    await db.user.create({
      data: {
        username: 'viewer',
        passwordHash: await hashPassword('secret'),
        role: 'VIEWER',
      },
    });
    memberId = member.id;

    adminCookie = await login('admin');
    memberCookie = await login('member');
    viewerCookie = await login('viewer');
  }, 30_000);

  async function login(username: string): Promise<string> {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ username, password: 'secret' })
      .expect(200);
    return response.get('Set-Cookie')![0]!.split(';')[0]!;
  }

  // An agent, not a bare Test: supertest only exposes `.set` on the request it
  // hands back, so a plain `request(server)` has nothing to set the cookie on.
  function asCookie(cookie: string) {
    return request.agent(app.getHttpServer()).set('Cookie', cookie);
  }

  async function createTeam(name: string): Promise<TeamBody> {
    const response = await asCookie(adminCookie)
      .post('/api/v1/teams')
      .send({ name })
      .expect(201);
    return response.body as TeamBody;
  }

  it('rejects a member and a viewer with 403', async () => {
    await asCookie(memberCookie).get('/api/v1/teams').expect(403);
    await asCookie(viewerCookie).get('/api/v1/teams').expect(403);
    await asCookie(memberCookie)
      .post('/api/v1/teams')
      .send({ name: 'Checkout' })
      .expect(403);
    // Still only the fixture's own team.
    expect(await db.team.count()).toBe(1);
  });

  it('rejects an api key even with the admin scope', async () => {
    // A key is a CI credential: it must never shape who can see which product.
    await authRequest(app).get('/api/v1/teams').expect(403);
  });

  it('creates a team, records the creator and rejects a duplicate name', async () => {
    const team = await createTeam('  Checkout  ');

    expect(team.name).toBe('Checkout');
    expect(team.createdBy).toBe('admin');
    expect(team.members).toEqual([]);
    expect(team.projects).toEqual([]);
    await asCookie(adminCookie)
      .post('/api/v1/teams')
      .send({ name: 'Checkout' })
      .expect(409);
    const audit = await db.auditEvent.findMany({
      where: { action: 'team.create' },
    });
    expect(audit).toHaveLength(1);
    expect(audit[0]!.actor).toBe('admin');
  });

  it('replaces the member set and records the diff', async () => {
    const team = await createTeam('Checkout');

    const added = await asCookie(adminCookie)
      .put(`/api/v1/teams/${team.id}/members`)
      .send({ userIds: [memberId] })
      .expect(200);
    expect((added.body as TeamBody).members).toEqual([
      { userId: memberId, username: 'member', role: 'MEMBER' },
    ]);

    const cleared = await asCookie(adminCookie)
      .put(`/api/v1/teams/${team.id}/members`)
      .send({ userIds: [] })
      .expect(200);
    expect((cleared.body as TeamBody).members).toEqual([]);

    const trail = await db.auditEvent.findMany({
      where: { action: 'team.members' },
    });
    expect(trail).toHaveLength(2);
    expect(trail.map((row) => row.metadata)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ addedUserIds: [memberId] }),
        expect.objectContaining({ removedUserIds: [memberId] }),
      ]),
    );
  });

  it('rejects an unknown user id instead of failing on the foreign key', async () => {
    const team = await createTeam('Checkout');

    await asCookie(adminCookie)
      .put(`/api/v1/teams/${team.id}/members`)
      .send({ userIds: ['does-not-exist'] })
      .expect(400);
  });

  it('lists the memberships of the caller on /auth/me', async () => {
    const team = await createTeam('Checkout');
    await asCookie(adminCookie)
      .put(`/api/v1/teams/${team.id}/members`)
      .send({ userIds: [memberId] })
      .expect(200);

    const me = await asCookie(memberCookie).get('/api/v1/auth/me').expect(200);
    expect(me.body.teams).toEqual([{ id: team.id, name: 'Checkout' }]);
  });

  it('refuses to delete a team that still owns a project', async () => {
    const team = await createTeam('Checkout');
    const base = await db.team.findUniqueOrThrow({ where: { name: 'Base' } });

    await asCookie(adminCookie)
      .patch('/api/v1/projects/checkout-ui/team')
      .send({ teamId: team.id })
      .expect(200);

    await asCookie(adminCookie).delete(`/api/v1/teams/${team.id}`).expect(409);
    expect(await db.team.count()).toBe(2);

    // The owner is mandatory, so the project moves to another team instead of
    // becoming unowned — and only then may the team go.
    const moved = await asCookie(adminCookie)
      .patch('/api/v1/projects/checkout-ui/team')
      .send({ teamId: base.id })
      .expect(200);
    expect(moved.body.teamName).toBe('Base');

    await asCookie(adminCookie).delete(`/api/v1/teams/${team.id}`).expect(200);
    expect(await db.team.count()).toBe(1);
    const trail = await db.auditEvent.findMany({
      where: { action: 'team.project-assign' },
    });
    expect(trail).toHaveLength(2);
    expect(trail.map((row) => row.metadata)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ from: 'Base', to: 'Checkout' }),
        expect.objectContaining({ from: 'Checkout', to: 'Base' }),
      ]),
    );
  });

  it('requires the assignment body to name a team, null included', async () => {
    await asCookie(adminCookie)
      .patch('/api/v1/projects/checkout-ui/team')
      .send({})
      .expect(422);
    // `null` used to mean "shared". Shared is a flag on the project now, so a
    // null team is a validation error rather than a second way to spell it.
    await asCookie(adminCookie)
      .patch('/api/v1/projects/checkout-ui/team')
      .send({ teamId: null })
      .expect(422);
  });

  it('answers 404 for an unknown project or an unknown team', async () => {
    const team = await createTeam('Checkout');

    await asCookie(adminCookie)
      .patch('/api/v1/projects/billing-api/team')
      .send({ teamId: 'ghost-team' })
      .expect(404);

    await asCookie(adminCookie)
      .patch('/api/v1/projects/ghost-project/team')
      .send({ teamId: team.id })
      .expect(404);
  });

  it('narrows a project to its team and widens it again with the flag', async () => {
    // The member belongs to no team, so it sees only what is shared. Moving a
    // project into a team the member is not in hides it; nothing is shared by
    // accident any more, because the flag starts out false (ADR-083).
    const team = await createTeam('Checkout');
    await asCookie(adminCookie)
      .patch('/api/v1/projects/checkout-ui/team')
      .send({ teamId: team.id })
      .expect(200);

    const hidden = await asCookie(memberCookie)
      .get('/api/v1/projects')
      .expect(200);
    // Both projects now sit in a team the member is not in, so there is nothing
    // to see — the member-without-a-team state the empty copy describes.
    expect(hidden.body.data).toEqual([]);

    // Publishing is its own audited route, and the member may not call it.
    await asCookie(memberCookie)
      .patch('/api/v1/projects/checkout-ui/visibility')
      .send({ isShared: true })
      .expect(403);

    const published = await asCookie(adminCookie)
      .patch('/api/v1/projects/checkout-ui/visibility')
      .send({ isShared: true })
      .expect(200);
    expect(published.body).toEqual({
      projectName: 'checkout-ui',
      isShared: true,
    });

    const visible = await asCookie(memberCookie)
      .get('/api/v1/projects')
      .expect(200);
    expect(
      (visible.body.data as { name: string }[]).map((project) => project.name),
    ).toEqual(['checkout-ui']);

    const trail = await db.auditEvent.findMany({
      where: { action: 'project.visibility' },
      orderBy: { createdAt: 'asc' },
    });
    expect(trail).toHaveLength(1);
    expect(trail[0]).toMatchObject({
      actor: 'admin',
      projectName: 'checkout-ui',
      metadata: { from: false, to: true },
    });

    // Publishing names the owner instead of replacing it: the team keeps seeing
    // the project even after the flag is cleared again.
    const narrowed = await asCookie(adminCookie)
      .patch('/api/v1/projects/checkout-ui/visibility')
      .send({ isShared: false })
      .expect(200);
    expect(narrowed.body.isShared).toBe(false);
  });

  it('refuses the visibility route for an api key', async () => {
    await authRequest(app)
      .patch('/api/v1/projects/checkout-ui/visibility')
      .send({ isShared: true })
      .expect(403);
    expect(await db.auditEvent.count()).toBe(0);
  });
});
