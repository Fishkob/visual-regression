import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createBaselineWithVariant } from '../_support/utils/screenshot-fixtures';
import { TestApp } from '../_support/utils/test-app';
import { PrismaConnection } from '@/prisma/prisma-connection';
import type { PrismaClient } from '@/prisma/client';
import { hashPassword } from '@internal/auth/password-hasher';
import { hashToken } from '@internal/auth/token-hash';
import { AppConfigService } from '@config/app-config.service';

// The enforcement half of ADR-082: a route that names a project is refused
// outside the caller's scope, and "not yours" is indistinguishable from "does not
// exist". The list reads are narrowed by the same scope, and each surface below
// asserts that a foreign project is absent rather than merely unopened.
describe('Team-scoped project access (e2e)', () => {
  let app: INestApplication;
  let db: PrismaClient;
  let adminCookie: string;
  let memberACookie: string;
  let memberBCookie: string;
  let memberCCookie: string;
  let apiKeyHeader: string;
  let memberAId: string;

  // Pending work has to be seeded in the database: the API mode app does not run
  // the comparison worker, so an upload would only enqueue a job. The fixture
  // builds the rows in the order the upload path does.
  async function seedPending(project: string): Promise<void> {
    const branch = await db.branch.findFirstOrThrow({
      where: { project: { name: project } },
    });
    const test = await db.unifiedTest.create({
      data: { name: 'login', branchId: branch.id, kind: 'image' },
    });
    const { baseline } = await createBaselineWithVariant(db, {
      testId: test.id,
      imageHash: `hash-${project}`,
      imageUrl: `http://rustfs/${project}/baseline.png`,
      viewport: '1920x1080',
    });
    await db.unifiedComparison.create({
      data: {
        testId: test.id,
        baselineId: baseline.id,
        mismatchPixelCount: 12,
        diffImageUrl: `http://rustfs/${project}/diff.png`,
        status: 'PENDING_APPROVAL',
      },
    });
  }

  beforeAll(async () => {
    app = await TestApp.init();
    db = app.get(PrismaConnection).client;
    apiKeyHeader =
      app.get(AppConfigService).auth.apiKeyHeader?.toLowerCase() ?? 'x-api-key';
  });

  afterAll(async () => {
    await TestApp.close();
  });

  beforeEach(async () => {
    await TestApp.resetDb();

    await db.user.create({
      data: {
        username: 'admin',
        passwordHash: await hashPassword('secret'),
        role: 'ADMIN',
      },
    });
    const memberA = await db.user.create({
      data: {
        username: 'a',
        passwordHash: await hashPassword('secret'),
        role: 'MEMBER',
      },
    });
    const memberB = await db.user.create({
      data: {
        username: 'b',
        passwordHash: await hashPassword('secret'),
        role: 'MEMBER',
      },
    });
    // A member that belongs to no team: the state the 409 and the "only shared
    // projects" empty copy describe.
    await db.user.create({
      data: {
        username: 'c',
        passwordHash: await hashPassword('secret'),
        role: 'MEMBER',
      },
    });
    memberAId = memberA.id;

    adminCookie = await login('admin');
    memberACookie = await login('a');
    memberBCookie = await login('b');
    memberCCookie = await login('c');

    // Every project has an owner (ADR-083): checkout-ui belongs to team A
    // (member "a"), billing-api to team B (member "b"), and shared-ui is owned
    // by B *and* flagged visible to everyone — the two properties are
    // independent, so "everybody may look" no longer means "nobody owns it".
    const checkoutTeam = await db.team.create({
      data: { name: 'Checkout', members: { create: { userId: memberAId } } },
    });
    const billingTeam = await db.team.create({
      data: { name: 'Billing', members: { create: { userId: memberB.id } } },
    });
    await TestApp.createProject('checkout-ui', { teamId: checkoutTeam.id });
    await TestApp.createProject('billing-api', { teamId: billingTeam.id });
    await TestApp.createProject('shared-ui', {
      teamId: billingTeam.id,
      isShared: true,
    });
  }, 30_000);

  async function login(username: string): Promise<string> {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ username, password: 'secret' })
      .expect(200);
    return response.get('Set-Cookie')![0]!.split(';')[0]!;
  }

  const asMember = (path: string) =>
    request(app.getHttpServer()).get(path).set('Cookie', memberACookie);
  // Team B's member: everything team A's member may not see.
  const asMemberB = (path: string) =>
    request(app.getHttpServer()).get(path).set('Cookie', memberBCookie);
  const asAdmin = (path: string) =>
    request(app.getHttpServer()).get(path).set('Cookie', adminCookie);

  it('lets a member read the project of its team and the shared one', async () => {
    const owned = await asMember('/api/v1/projects/checkout-ui').expect(200);
    const shared = await asMember('/api/v1/projects/shared-ui').expect(200);

    // The owner's name rides on the project read a member already performs:
    // reading it is not administering it (ADR-082 amendment). It is the answer
    // to "why do I see this", which the ADMIN-only team list cannot give.
    expect(owned.body).toMatchObject({
      teamName: 'Checkout',
      isShared: false,
    });
    // A shared project names its owner too: the flag says everybody may look,
    // it does not say nobody is responsible.
    expect(shared.body).toMatchObject({ teamName: 'Billing', isShared: true });
  });

  it('answers 404 for another team’s project, exactly like a missing one', async () => {
    const foreign = await asMember('/api/v1/projects/billing-api').expect(404);
    const missing = await asMember('/api/v1/projects/ghost').expect(404);

    // Same shape, so the answer cannot be used to enumerate other teams'
    // projects.
    expect(foreign.body.statusCode).toBe(404);
    expect(missing.body.statusCode).toBe(404);
  });

  // The third direction ADR-083 pins: a member that belongs to no team cannot
  // create a project, because there is no team that could own it. It says so
  // instead of landing the project in a bucket nobody is responsible for.
  it('refuses a creator that belongs to no team', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/projects')
      .set('Cookie', memberCCookie)
      .send({ name: 'lonely-ui' })
      .expect(409);

    expect(response.body.message).toMatch(/do not belong to a team/i);
    expect(await db.project.count({ where: { name: 'lonely-ui' } })).toBe(0);
  });

  it('creates a project in the creator’s own team, never a foreign one', async () => {
    // No teamId: the service falls back to the caller's first team, which is the
    // same order `/auth/me` reports and the dialog preselects.
    const created = await request(app.getHttpServer())
      .post('/api/v1/projects')
      .set('Cookie', memberACookie)
      .send({ name: 'checkout-ui-2' })
      .expect(201);
    expect(created.body).toMatchObject({ teamName: 'Checkout' });

    const foreign = await db.team.findUniqueOrThrow({
      where: { name: 'Billing' },
    });
    await request(app.getHttpServer())
      .post('/api/v1/projects')
      .set('Cookie', memberACookie)
      .send({ name: 'smuggled-ui', teamId: foreign.id })
      .expect(404);
    expect(await db.project.count({ where: { name: 'smuggled-ui' } })).toBe(0);
  });

  it('refuses a nested route of a foreign project', async () => {
    await asMember('/api/v1/projects/billing-api/branches').expect(404);
    await asMember('/api/v1/projects/checkout-ui/branches').expect(200);
    // The same boundary from the other side: B may not open A's project.
    await asMemberB('/api/v1/projects/checkout-ui/branches').expect(404);
  });

  it('refuses an upload into a foreign project before the intake runs', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/projects/billing-api/tests/login/upload')
      .set('Cookie', memberACookie)
      .field('viewport', '1920x1080')
      .field('browser', 'Chrome')
      .field('environment', 'staging')
      .attach('file', Buffer.from('not-an-image'), 'shot.png')
      .expect(404);

    expect(response.body.statusCode).toBe(404);
    expect(await db.unifiedTest.count()).toBe(0);
  });

  it('lets an admin read every project', async () => {
    await asAdmin('/api/v1/projects/billing-api').expect(200);
    await asAdmin('/api/v1/projects/checkout-ui').expect(200);
  });

  it('narrows an api key to its owner’s scope, not just to its own allowlist', async () => {
    // A key with no allowlist used to mean "every project". Its owner is a
    // member of team A, so the key inherits that boundary (ADR-082 decision 9).
    await db.apiKey.create({
      data: {
        name: 'member-key',
        keyHash: hashToken('member-key'),
        scopes: ['read'],
        projectIds: [],
        ownerId: memberAId,
      },
    });
    const withKey = (path: string) =>
      request(app.getHttpServer()).get(path).set(apiKeyHeader, 'member-key');

    await withKey('/api/v1/projects/checkout-ui').expect(200);
    await withKey('/api/v1/projects/billing-api').expect(403);
  });

  it('still answers the team’s own project for an allowlisted key', async () => {
    const checkout = await db.project.findUnique({
      where: { name: 'checkout-ui' },
    });
    await db.apiKey.create({
      data: {
        name: 'allowlisted',
        keyHash: hashToken('allowlisted-key'),
        scopes: ['read'],
        projectIds: [checkout!.id],
        ownerId: memberAId,
      },
    });
    const withKey = (path: string) =>
      request(app.getHttpServer())
        .get(path)
        .set(apiKeyHeader, 'allowlisted-key');

    await withKey('/api/v1/projects/checkout-ui').expect(200);
    await withKey('/api/v1/projects/billing-api').expect(403);
    // A key that named its projects is refused the cross-project reads even
    // though they are filtered: the narrower answer is the one the allowlist
    // asked for, and a key cannot widen itself back into the inbox.
    await withKey('/api/v1/review/pending').expect(403);
  });

  it('lists only the projects the caller may open', async () => {
    const response = await asMember('/api/v1/projects').expect(200);
    const names = (response.body.data as { name: string }[]).map(
      (project) => project.name,
    );

    expect(names.sort()).toEqual(['checkout-ui', 'shared-ui']);
  });

  it('narrows the project list that carries the pending flags', async () => {
    const response = await asMember('/api/v1/projects/pending').expect(200);
    const names = (response.body.data as { name: string }[]).map(
      (project) => project.name,
    );

    expect(names.sort()).toEqual(['checkout-ui', 'shared-ui']);
  });

  it('narrows the review inbox and its branch choices', async () => {
    await seedPending('checkout-ui');
    await seedPending('billing-api');

    const page = await asMember('/api/v1/review/pending').expect(200);
    const projects = new Set(
      (page.body.data as { projectName: string }[]).map(
        (row) => row.projectName,
      ),
    );
    expect([...projects]).toEqual(['checkout-ui']);

    // Every pending project is checkout-ui's, so the dropdown has no foreign
    // branch to offer.
    const branches = await asMember('/api/v1/review/branches').expect(200);
    expect(branches.body).toEqual(['main']);

    // The admin sees both, which is what makes the assertion above meaningful.
    const all = await asAdmin('/api/v1/review/pending').expect(200);
    const allProjects = new Set(
      (all.body.data as { projectName: string }[]).map(
        (row) => row.projectName,
      ),
    );
    expect([...allProjects].sort()).toEqual(['billing-api', 'checkout-ui']);
  });

  it('filters the inbox by team without widening the scope', async () => {
    await seedPending('checkout-ui');
    await seedPending('billing-api');
    const billing = await db.team.findUniqueOrThrow({
      where: { name: 'Billing' },
    });
    const checkout = await db.team.findUniqueOrThrow({
      where: { name: 'Checkout' },
    });

    // A member's own team narrows to that team.
    const own = await asMember(
      `/api/v1/review/pending?teamId=${checkout.id}`,
    ).expect(200);
    expect(
      (own.body.data as { projectName: string }[]).map(
        (row) => row.projectName,
      ),
    ).toEqual(['checkout-ui']);

    // Naming somebody else's team matches nothing instead of widening, and the
    // branch dropdown follows the same lens.
    const foreign = await asMember(
      `/api/v1/review/pending?teamId=${billing.id}`,
    ).expect(200);
    expect(foreign.body.data).toEqual([]);
    const foreignBranches = await asMember(
      `/api/v1/review/branches?teamId=${billing.id}`,
    ).expect(200);
    expect(foreignBranches.body).toEqual([]);

    // An admin may use the lens to walk one team's queue.
    const asAdminBilling = await asAdmin(
      `/api/v1/review/pending?teamId=${billing.id}`,
    ).expect(200);
    expect(
      (asAdminBilling.body.data as { projectName: string }[]).map(
        (row) => row.projectName,
      ),
    ).toEqual(['billing-api']);
  });

  it('finds only what the caller may open in the global search', async () => {
    const mine = await asMember('/api/v1/search?q=ui').expect(200);
    expect(
      (mine.body.projects as { name: string }[]).map((p) => p.name).sort(),
    ).toEqual(['checkout-ui', 'shared-ui']);

    // The project name is not a hint the member can use to discover it.
    const foreign = await asMember('/api/v1/search?q=billing').expect(200);
    expect(foreign.body.projects).toEqual([]);
    expect(foreign.body.tests).toEqual([]);
    expect(foreign.body.branches).toEqual([]);
  });

  it('counts only the caller’s projects in the group badges', async () => {
    const group = await request(app.getHttpServer())
      .post('/api/v1/groups')
      .set('Cookie', adminCookie)
      .send({ name: 'Shop' })
      .expect(201);
    await request(app.getHttpServer())
      .patch('/api/v1/projects/bulk/group')
      .set('Cookie', adminCookie)
      .send({
        projectNames: ['checkout-ui', 'billing-api'],
        groupId: group.body.id,
      })
      .expect(200);

    const mine = await asMember('/api/v1/groups').expect(200);
    expect(mine.body).toEqual([
      expect.objectContaining({ name: 'Shop', projectCount: 1 }),
    ]);

    const all = await asAdmin('/api/v1/groups').expect(200);
    expect(all.body).toEqual([
      expect.objectContaining({ name: 'Shop', projectCount: 2 }),
    ]);
  });

  it('refuses a group delete that would clear a foreign project’s label', async () => {
    const group = await request(app.getHttpServer())
      .post('/api/v1/groups')
      .set('Cookie', adminCookie)
      .send({ name: 'Shop' })
      .expect(201);
    await request(app.getHttpServer())
      .patch('/api/v1/projects/bulk/group')
      .set('Cookie', adminCookie)
      .send({
        projectNames: ['checkout-ui', 'billing-api'],
        groupId: group.body.id,
      })
      .expect(200);

    // Deleting the group clears `groupId` on every project in it (the FK is
    // SET NULL), so a member that can see only half of it would rewrite the
    // other half. The refusal names no count — a number would confirm what the
    // member cannot open.
    const refused = await request(app.getHttpServer())
      .delete(`/api/v1/groups/${group.body.id}`)
      .set('Cookie', memberACookie)
      .expect(409);
    expect(refused.body.message).not.toMatch(/\d/);

    // An admin may, which is what makes the refusal above a scope rule.
    await request(app.getHttpServer())
      .delete(`/api/v1/groups/${group.body.id}`)
      .set('Cookie', adminCookie)
      .expect(200);
  });

  it('leaves a foreign assignment out of my work list', async () => {
    await seedPending('checkout-ui');
    await seedPending('billing-api');
    for (const project of ['checkout-ui', 'billing-api']) {
      await request(app.getHttpServer())
        .post(`/api/v1/projects/${project}/assignments`)
        .set('Cookie', adminCookie)
        .send({ testName: 'login', assignee: 'a' })
        .expect(201);
    }

    const mine = await asMember('/api/v1/assignments/mine').expect(200);
    expect(
      (mine.body as { projectName: string }[]).map((row) => row.projectName),
    ).toEqual(['checkout-ui']);
  });
});
