import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { TestApp } from '../_support/utils/test-app';
import { PrismaConnection } from '@/prisma/prisma-connection';
import { PrismaClient } from '@/prisma/client';
import { hashPassword } from '@internal/auth/password-hasher';

describe('Project review policy (e2e)', () => {
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
    await db.user.createMany({
      data: [
        {
          username: 'member',
          passwordHash: await hashPassword('secret'),
          role: 'MEMBER',
        },
        {
          username: 'admin',
          passwordHash: await hashPassword('secret'),
          role: 'ADMIN',
        },
      ],
    });
  }, 30_000);

  async function login(username: string) {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ username, password: 'secret' })
      .expect(200);
    return response.get('Set-Cookie')![0].split(';')[0]!;
  }

  function patchPolicy(
    projectName: string,
    cookie: string,
    body: Record<string, unknown>,
  ) {
    return request(app.getHttpServer())
      .patch(`/api/v1/projects/${projectName}/review-policy`)
      .set('Cookie', cookie)
      .send(body);
  }

  it('rejects a MEMBER without changing the policy', async () => {
    await TestApp.createProject('policy-member');
    const member = await login('member');

    await patchPolicy('policy-member', member, { requiredApprovals: 3 }).expect(
      403,
    );

    const project = await db.project.findUniqueOrThrow({
      where: { name: 'policy-member' },
    });
    expect(project.requiredApprovals).toBe(1);
    expect(
      await db.auditEvent.count({ where: { projectName: 'policy-member' } }),
    ).toBe(0);
  });

  it('lets an ADMIN update the policy and audits from/to', async () => {
    const { projectId } = await TestApp.createProject('policy-admin');
    const admin = await login('admin');

    const first = await patchPolicy('policy-admin', admin, {
      requiredApprovals: 3,
    }).expect(200);
    expect(first.body).toEqual({ requiredApprovals: 3 });

    const second = await patchPolicy('policy-admin', admin, {
      requiredApprovals: 2,
    }).expect(200);
    expect(second.body).toEqual({ requiredApprovals: 2 });

    const project = await db.project.findUniqueOrThrow({
      where: { name: 'policy-admin' },
    });
    expect(project.requiredApprovals).toBe(2);

    const audit = await request(app.getHttpServer())
      .get(
        '/api/v1/audit?action=project.review-policy&projectName=policy-admin',
      )
      .set('Cookie', admin)
      .expect(200);
    expect(audit.body.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: 'project.review-policy',
          actor: 'admin',
          projectName: 'policy-admin',
          targetType: 'project',
          targetId: projectId,
          metadata: { from: 1, to: 3 },
        }),
        expect.objectContaining({
          action: 'project.review-policy',
          actor: 'admin',
          metadata: { from: 3, to: 2 },
        }),
      ]),
    );
  });

  it('validates the approval range', async () => {
    await TestApp.createProject('policy-range');
    const admin = await login('admin');

    await patchPolicy('policy-range', admin, { requiredApprovals: 0 }).expect(
      422,
    );
    await patchPolicy('policy-range', admin, { requiredApprovals: 11 }).expect(
      422,
    );
    await patchPolicy('policy-range', admin, {}).expect(422);

    const project = await db.project.findUniqueOrThrow({
      where: { name: 'policy-range' },
    });
    expect(project.requiredApprovals).toBe(1);
    expect(
      await db.auditEvent.count({ where: { projectName: 'policy-range' } }),
    ).toBe(0);
  });

  it('rejects the policy field on the generic project PATCH', async () => {
    await TestApp.createProject('policy-generic');
    const admin = await login('admin');

    await request(app.getHttpServer())
      .patch('/api/v1/projects/policy-generic')
      .set('Cookie', admin)
      .send({ requiredApprovals: 5 })
      .expect(422);

    const project = await db.project.findUniqueOrThrow({
      where: { name: 'policy-generic' },
    });
    expect(project.requiredApprovals).toBe(1);
  });

  it('returns 404 for an unknown project', async () => {
    const admin = await login('admin');

    await patchPolicy('does-not-exist', admin, {
      requiredApprovals: 2,
    }).expect(404);
  });
});
