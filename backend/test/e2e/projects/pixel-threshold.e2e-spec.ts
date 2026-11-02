import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { TestApp } from '../_support/utils/test-app';
import { PrismaConnection } from '@/prisma/prisma-connection';
import { PrismaClient } from '@/prisma/client';
import { hashPassword } from '@internal/auth/password-hasher';

describe('Project pixel threshold (e2e)', () => {
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

  async function login(username: string): Promise<string> {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ username, password: 'secret' })
      .expect(200);
    return response.get('Set-Cookie')![0].split(';')[0]!;
  }

  function patchThreshold(
    projectName: string,
    cookie: string,
    body: Record<string, unknown>,
  ) {
    return request(app.getHttpServer())
      .patch(`/api/v1/projects/${projectName}/pixel-threshold`)
      .set('Cookie', cookie)
      .send(body);
  }

  it('rejects a MEMBER without changing the default', async () => {
    await TestApp.createProject('threshold-member');
    const member = await login('member');

    await patchThreshold('threshold-member', member, {
      pixelDiffThreshold: 25,
    }).expect(403);

    const project = await db.project.findUniqueOrThrow({
      where: { name: 'threshold-member' },
    });
    expect(project.pixelDiffThreshold).toBeNull();
    expect(
      await db.auditEvent.count({
        where: { projectName: 'threshold-member' },
      }),
    ).toBe(0);
  });

  it('lets an ADMIN set and clear the default, audited from/to', async () => {
    await TestApp.createProject('threshold-admin');
    const admin = await login('admin');

    const set = await patchThreshold('threshold-admin', admin, {
      pixelDiffThreshold: 25,
    }).expect(200);
    expect(set.body).toEqual({ pixelDiffThreshold: 25 });

    const project = await request(app.getHttpServer())
      .get('/api/v1/projects/threshold-admin')
      .set('Cookie', admin)
      .expect(200);
    expect(project.body.pixelDiffThreshold).toBe(25);

    const audit = await db.auditEvent.findFirstOrThrow({
      where: {
        projectName: 'threshold-admin',
        action: 'project.pixel-threshold',
      },
    });
    expect(audit.metadata).toEqual({ from: null, to: 25 });

    const cleared = await patchThreshold('threshold-admin', admin, {
      pixelDiffThreshold: null,
    }).expect(200);
    expect(cleared.body).toEqual({ pixelDiffThreshold: null });
  });

  it('rejects an invalid threshold', async () => {
    await TestApp.createProject('threshold-invalid');
    const admin = await login('admin');

    await patchThreshold('threshold-invalid', admin, {
      pixelDiffThreshold: -1,
    }).expect(422);
    await patchThreshold('threshold-invalid', admin, {
      pixelDiffThreshold: 1.5,
    }).expect(422);
  });
});
