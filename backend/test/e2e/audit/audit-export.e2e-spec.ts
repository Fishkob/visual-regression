import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { TestApp } from '../_support/utils/test-app';
import { authRequest } from '../_support/utils/authenticated-request';
import { PrismaConnection } from '@/prisma/prisma-connection';
import type { PrismaClient } from '@/prisma/client';
import { hashPassword } from '@internal/auth/password-hasher';

// The trail outlives the rows it names, so it is not part of resetDb(). Every
// assertion below filters to names that carry this run's tag, which keeps a
// re-run against the same database green.
const RUN_TAG = Date.now().toString(36).slice(-6);
const PROJECT = `audit-${RUN_TAG}`;

describe('Audit CSV export (e2e)', () => {
  let app: INestApplication;
  let db: PrismaClient;
  let cookie: string;

  beforeAll(async () => {
    app = await TestApp.init();
    db = app.get(PrismaConnection).client;
  });

  async function seedUser(username: string, role: 'ADMIN' | 'MEMBER') {
    return db.user.create({
      data: {
        username,
        passwordHash: await hashPassword('secret'),
        role,
      },
    });
  }

  beforeEach(async () => {
    await TestApp.resetDb();
    await TestApp.createProject(PROJECT);
    await seedUser('audit-admin', 'ADMIN');
    await seedUser('audit-member', 'MEMBER');
    cookie = await login('audit-admin');
  }, 30_000);

  afterAll(async () => {
    await TestApp.close();
  });

  function login(username: string): Promise<string> {
    return request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ username, password: 'secret' })
      .expect(200)
      .then((response) => response.get('Set-Cookie')![0]!.split(';')[0]!);
  }

  function exportCsv(query: Record<string, string>) {
    return request(app.getHttpServer())
      .get('/api/v1/audit/export')
      .query(query)
      .set('Cookie', cookie);
  }

  it('exports the filtered trail as an attached CSV document', async () => {
    const renamed = `${PROJECT}-renamed`;
    await request(app.getHttpServer())
      .patch(`/api/v1/projects/${PROJECT}`)
      .set('Cookie', cookie)
      .send({ name: renamed })
      .expect(200);

    const response = await exportCsv({
      action: 'project.rename',
      projectName: renamed,
    }).expect(200);

    expect(response.headers['content-type']).toContain('text/csv');
    expect(response.headers['content-disposition']).toBe(
      'attachment; filename="audit.csv"',
    );

    const lines = response.text.trimEnd().split('\n');
    expect(lines[0]).toBe(
      'createdAt,actor,action,projectName,testName,branchName,targetType,targetId,metadata',
    );
    expect(lines).toHaveLength(2);
    const row = lines[1]!;
    expect(row).toContain('"project.rename"');
    expect(row).toContain('"audit-admin"');
    expect(row).toContain(`"${renamed}"`);
    expect(row).toContain('"renamedFrom"');
    expect(row).toContain(`"${PROJECT}"`);
  });

  it('exports only the header row when the filter matches nothing', async () => {
    await request(app.getHttpServer())
      .patch(`/api/v1/projects/${PROJECT}`)
      .set('Cookie', cookie)
      .send({ name: `${PROJECT}-other` })
      .expect(200);

    const response = await exportCsv({
      action: 'project.rename',
      projectName: `audit-${RUN_TAG}-nothing`,
    }).expect(200);
    expect(response.headers['content-type']).toContain('text/csv');
    expect(response.text).toBe(
      'createdAt,actor,action,projectName,testName,branchName,targetType,targetId,metadata',
    );
  });

  it('filters by actor and by a date window', async () => {
    await seedUser('audit-other', 'ADMIN');
    const from = new Date().toISOString();

    const otherCookie = await login('audit-other');
    await request(app.getHttpServer())
      .patch(`/api/v1/projects/${PROJECT}`)
      .set('Cookie', otherCookie)
      .send({ name: `${PROJECT}-by-other` })
      .expect(200);

    const byActor = await exportCsv({
      action: 'project.rename',
      projectName: `${PROJECT}-by-other`,
      actor: 'audit-admin',
    }).expect(200);
    expect(byActor.text.trimEnd().split('\n')).toHaveLength(1);

    const byWindow = await exportCsv({
      action: 'project.rename',
      projectName: `${PROJECT}-by-other`,
      from,
    }).expect(200);
    const lines = byWindow.text.trimEnd().split('\n');
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain('"audit-other"');
  });

  it('rejects an unknown action filter', async () => {
    // The action enum is the read side of the same constant the writers use, so
    // a misspelled filter is a client error instead of a silently empty export.
    await exportCsv({ action: 'project.explode' }).expect(422);
  });

  it('keeps the export admin-session-only', async () => {
    const memberCookie = await login('audit-member');
    await request(app.getHttpServer())
      .get('/api/v1/audit/export')
      .set('Cookie', memberCookie)
      .expect(403);

    // An admin-scoped api key is still not a browser session (ADR-035).
    await authRequest(app).get('/api/v1/audit/export').expect(403);

    await request(app.getHttpServer()).get('/api/v1/audit/export').expect(401);
  });
});
