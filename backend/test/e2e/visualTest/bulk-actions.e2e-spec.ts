import { INestApplication } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { TestApp } from '../_support/utils/test-app';
import { authRequest } from '../_support/utils/authenticated-request';
import { PrismaConnection } from '@/prisma/prisma-connection';
import { PrismaClient } from '@/prisma/client';
import { hashPassword } from '@internal/auth/password-hasher';
import request from 'supertest';

describe('Bulk actions (e2e)', () => {
  let app: INestApplication;
  let db: PrismaClient;
  const baseline = path.join(__dirname, 'fixtures', 'baseline_black.png');

  beforeAll(async () => {
    app = await TestApp.init();
    db = app.get(PrismaConnection).client;
  });

  beforeEach(async () => {
    await TestApp.resetDb();
    await TestApp.createProject('shop');
  }, 30_000);

  afterAll(async () => {
    await TestApp.close();
  });

  async function uploadTest(project: string, testName: string) {
    await authRequest(app)
      .post(
        `/api/v1/projects/${project}/tests/${testName}/upload?testKind=image`,
      )
      .field('viewport', '1920x1080')
      .field('browser', 'Chrome')
      .field('environment', 'staging')
      .attach('file', fs.createReadStream(baseline))
      .expect(201);
  }

  it('deletes tests per item and reports the missing one', async () => {
    await uploadTest('shop', 'login');
    await uploadTest('shop', 'signup');

    const result = await authRequest(app)
      .post('/api/v1/projects/shop/bulk/test-deletions')
      .send({ testNames: ['login', 'gone'] })
      .expect(201);

    expect(result.body.deleted).toEqual([{ id: 'login', success: true }]);
    expect(result.body.failed).toEqual([
      {
        id: 'gone',
        success: false,
        error: 'Test not found on this branch',
      },
    ]);
  });

  it('approves nothing but reports every unknown comparison', async () => {
    const result = await authRequest(app)
      .post('/api/v1/projects/shop/bulk/approvals')
      .send({ comparisonIds: ['missing-1', 'missing-2'] })
      .expect(201);

    expect(result.body.approved).toEqual([]);
    expect(result.body.failed).toHaveLength(2);
    expect(result.body.failed[0]).toEqual(
      expect.objectContaining({ id: 'missing-1', success: false }),
    );
  });

  it('moves projects into a group per item', async () => {
    await TestApp.createProject('other');
    const group = await db.projectGroup.create({ data: { name: 'Team' } });

    const result = await authRequest(app)
      .patch('/api/v1/projects/bulk/group')
      .send({ projectNames: ['shop', 'other'], groupId: group.id })
      .expect(200);

    expect(result.body.moved).toHaveLength(2);
    expect(result.body.failed).toEqual([]);
    expect(await db.project.count({ where: { groupId: group.id } })).toBe(2);
  });

  it('rejects bulk writes from a viewer session', async () => {
    await db.user.create({
      data: {
        username: 'viewer',
        passwordHash: await hashPassword('secret'),
        role: 'VIEWER',
      },
    });
    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ username: 'viewer', password: 'secret' })
      .expect(200);
    const cookie = login.get('Set-Cookie')![0].split(';')[0]!;

    await request(app.getHttpServer())
      .post('/api/v1/projects/shop/bulk/test-deletions')
      .set('Cookie', cookie)
      .send({ testNames: ['login'] })
      .expect(403);
  });
});
