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
    await TestApp.createProject('checkout-ui');
    await db.project.create({ data: { name: 'billing-api' } });

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
    expect(await db.team.count()).toBe(0);
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

    await asCookie(adminCookie)
      .patch('/api/v1/projects/checkout-ui/team')
      .send({ teamId: team.id })
      .expect(200);

    await asCookie(adminCookie).delete(`/api/v1/teams/${team.id}`).expect(409);
    expect(await db.team.count()).toBe(1);

    // Unassigning is the "shared" state, and only then may the team go.
    const unassigned = await asCookie(adminCookie)
      .patch('/api/v1/projects/checkout-ui/team')
      .send({ teamId: null })
      .expect(200);
    expect(unassigned.body.teamId).toBeNull();

    await asCookie(adminCookie).delete(`/api/v1/teams/${team.id}`).expect(200);
    expect(await db.team.count()).toBe(0);
    const trail = await db.auditEvent.findMany({
      where: { action: 'team.project-assign' },
    });
    expect(trail).toHaveLength(2);
    expect(trail.map((row) => row.metadata)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ from: null, to: 'Checkout' }),
        expect.objectContaining({ from: 'Checkout', to: null }),
      ]),
    );
  });

  it('requires the assignment body to name a team, null included', async () => {
    await asCookie(adminCookie)
      .patch('/api/v1/projects/checkout-ui/team')
      .send({})
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

  it('keeps an untagged project shared and a tagged one team-only', async () => {
    // The promise the migration makes: a project nobody assigned stays visible
    // to everybody, and tagging is what narrows it. `billing-api` is untagged
    // here and the member belongs to no team.
    const team = await createTeam('Checkout');
    await asCookie(adminCookie)
      .patch('/api/v1/projects/checkout-ui/team')
      .send({ teamId: team.id })
      .expect(200);

    const projects = await asCookie(memberCookie)
      .get('/api/v1/projects')
      .expect(200);
    const names = (projects.body.data as { name: string }[]).map(
      (project) => project.name,
    );
    expect(names).toEqual(['billing-api']);
  });
});
