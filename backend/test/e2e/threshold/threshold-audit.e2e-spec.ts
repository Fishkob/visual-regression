import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { TestApp } from '../_support/utils/test-app';
import { PrismaConnection } from '@/prisma/prisma-connection';
import { PrismaClient } from '@/prisma/client';
import { hashPassword } from '@internal/auth/password-hasher';
import {
  createBaselineWithVariant,
  variantIdForBaseline,
} from '../_support/utils/screenshot-fixtures';

describe('Threshold update policy (e2e)', () => {
  let app: INestApplication;
  let db: PrismaClient;
  const variantQuery = 'viewport=1920x1080&browser=Chrome&environment=staging';

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

  function patchThreshold(
    projectName: string,
    testName: string,
    cookie: string,
    body: { threshold: number },
    query = variantQuery,
  ) {
    return request(app.getHttpServer())
      .patch(
        `/api/v1/projects/${projectName}/tests/${testName}/threshold?${query}`,
      )
      .set('Cookie', cookie)
      .send(body);
  }

  // A seeded test with one baseline at threshold 0 and one variant pointing at
  // it: enough to drive the threshold update without running the upload worker.
  async function seedThresholdTest(projectName: string) {
    const { branchId } = await TestApp.createProject(projectName);
    const test = await db.unifiedTest.create({
      data: { name: 'login', branchId, kind: 'image' },
    });
    const { baseline } = await createBaselineWithVariant(db, {
      testId: test.id,
      imageHash: 'baseline-hash',
      imageUrl: 'http://rustfs/baseline.png',
      pixelDiffThreshold: 0,
    });
    return { testId: test.id, baselineId: baseline.id };
  }

  async function seedPendingComparison(testId: string, baselineId: string) {
    const candidate = await db.unifiedScreenshot.create({
      data: {
        testId,
        variantId: await variantIdForBaseline(db, baselineId),
        type: 'CURRENT',
        imageHash: 'candidate-hash',
        imageUrl: 'http://rustfs/candidate.png',
      },
    });
    return db.unifiedComparison.create({
      data: {
        testId,
        baselineId,
        candidateId: candidate.id,
        mismatchPixelCount: 5,
        diffImageUrl: 'http://rustfs/diff.png',
        status: 'PENDING_APPROVAL',
      },
    });
  }

  it('lets an ADMIN update the threshold and audits from/to plus the auto-accepted count', async () => {
    const { testId, baselineId } = await seedThresholdTest(
      'threshold-audit-admin',
    );
    const comparison = await seedPendingComparison(testId, baselineId);
    const admin = await login('admin');

    const response = await patchThreshold(
      'threshold-audit-admin',
      'login',
      admin,
      { threshold: 20 },
    ).expect(200);
    expect(response.body).toEqual({
      test: 'login',
      status: 'updated',
      threshold: 20,
      autoAcceptedCount: 1,
    });

    const baseline = await db.unifiedScreenshot.findUniqueOrThrow({
      where: { id: baselineId },
    });
    expect(baseline.pixelDiffThreshold).toBe(20);
    expect(
      await db.unifiedComparison.findUnique({ where: { id: comparison.id } }),
    ).toBeNull();

    const audit = await request(app.getHttpServer())
      .get(
        '/api/v1/audit?action=test.threshold&projectName=threshold-audit-admin',
      )
      .set('Cookie', admin)
      .expect(200);
    expect(audit.body.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: 'test.threshold',
          actor: 'admin',
          projectName: 'threshold-audit-admin',
          testName: 'login',
          targetType: 'test',
          targetId: testId,
          metadata: { from: [0], to: 20, autoAcceptedCount: 1 },
        }),
      ]),
    );
  });

  it('does not audit a preview and leaves the threshold untouched', async () => {
    const { baselineId } = await seedThresholdTest('threshold-audit-preview');
    const admin = await login('admin');

    const response = await patchThreshold(
      'threshold-audit-preview',
      'login',
      admin,
      { threshold: 7 },
      `${variantQuery}&preview=true`,
    ).expect(200);
    expect(response.body).toEqual({
      test: 'login',
      status: 'updated',
      threshold: 7,
      autoAcceptedCount: 0,
    });

    const baseline = await db.unifiedScreenshot.findUniqueOrThrow({
      where: { id: baselineId },
    });
    expect(baseline.pixelDiffThreshold).toBe(0);
    expect(
      await db.auditEvent.count({
        where: { projectName: 'threshold-audit-preview' },
      }),
    ).toBe(0);
  });

  it('rejects a MEMBER without changing the threshold or writing an audit row', async () => {
    const { baselineId } = await seedThresholdTest('threshold-audit-member');
    const member = await login('member');

    await patchThreshold('threshold-audit-member', 'login', member, {
      threshold: 20,
    }).expect(403);

    const baseline = await db.unifiedScreenshot.findUniqueOrThrow({
      where: { id: baselineId },
    });
    expect(baseline.pixelDiffThreshold).toBe(0);
    expect(
      await db.auditEvent.count({
        where: { projectName: 'threshold-audit-member' },
      }),
    ).toBe(0);
  });
});
