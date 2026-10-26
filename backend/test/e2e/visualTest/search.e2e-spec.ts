import { INestApplication } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { TestApp } from '../_support/utils/test-app';
import { authRequest } from '../_support/utils/authenticated-request';
import { PrismaConnection } from '@/prisma/prisma-connection';
import type { PrismaClient } from '@/prisma/client';

describe('Global search (e2e)', () => {
  let app: INestApplication;
  let db: PrismaClient;
  const baseline = path.join(__dirname, 'fixtures', 'baseline_black.png');
  const mismatch = path.join(__dirname, 'fixtures', 'baseline_blue.png');

  beforeAll(async () => {
    app = await TestApp.init();
    db = app.get(PrismaConnection).client;
  });

  beforeEach(async () => {
    await TestApp.resetDb();
    await TestApp.createProject('checkout-ui');
    await authRequest(app)
      .post(
        '/api/v1/projects/checkout-ui/tests/login-form/upload?testKind=image',
      )
      .field('viewport', '1920x1080')
      .field('browser', 'Chrome')
      .field('environment', 'staging')
      .attach('file', fs.createReadStream(baseline))
      .expect(201);
    await authRequest(app)
      .post('/api/v1/projects/checkout-ui/tests/signup/upload?testKind=image')
      .field('viewport', '1920x1080')
      .field('browser', 'Chrome')
      .field('environment', 'staging')
      .attach('file', fs.createReadStream(baseline))
      .expect(201);
    const project = await db.project.findUnique({
      where: { name: 'checkout-ui' },
    });
    await db.branch.create({
      data: {
        name: 'feature/checkout',
        projectId: project!.id,
        targetBranchId: project!.defaultBranchId,
      },
    });
  }, 30_000);

  afterAll(async () => {
    await TestApp.close();
  });

  it('finds tests by name and returns their project/branch', async () => {
    const result = await authRequest(app)
      .get('/api/v1/search?q=LOGIN')
      .expect(200);

    expect(result.body.query).toBe('LOGIN');
    expect(result.body.tests).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          projectName: 'checkout-ui',
          branchName: 'main',
          testName: 'login-form',
          kind: 'image',
        }),
      ]),
    );
  });

  it('finds projects and branches by name', async () => {
    const projects = await authRequest(app)
      .get('/api/v1/search?q=checkout-ui')
      .expect(200);
    expect(projects.body.projects).toEqual([{ name: 'checkout-ui' }]);
    expect(projects.body.tests.length).toBeGreaterThan(0);
    expect(projects.body.branches.length).toBeGreaterThan(0);

    const branches = await authRequest(app)
      .get('/api/v1/search?q=feature')
      .expect(200);
    expect(branches.body.branches).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          projectName: 'checkout-ui',
          branchName: 'feature/checkout',
          isDefault: false,
        }),
      ]),
    );
  });

  it('keeps archived branches and their tests out of the results', async () => {
    const project = await db.project.findUniqueOrThrow({
      where: { name: 'checkout-ui' },
    });
    const archived = await db.branch.create({
      data: {
        name: 'legacy/archived',
        projectId: project.id,
        targetBranchId: project.defaultBranchId,
        isArchived: true,
      },
    });
    // A materialized test on the archived branch: a destination that no longer
    // exists for the user.
    await db.unifiedTest.create({
      data: { name: 'archived-checkout', kind: 'image', branchId: archived.id },
    });

    const result = await authRequest(app)
      .get('/api/v1/search?q=archived')
      .expect(200);

    expect(result.body.branches).toEqual([]);
    expect(result.body.tests).toEqual([]);
  });

  it('returns one hit per materialized branch, not one per test name', async () => {
    // The palette navigates with the hit's branch, so the same name on two
    // branches is two destinations by design (see SearchRepository).
    await authRequest(app)
      // A different image: the identical fast path would leave the branch
      // inheriting main's baseline and materialize no test of its own.
      .post(
        '/api/v1/projects/checkout-ui/tests/login-form/upload?testKind=image',
      )
      .field('branch', 'feature/checkout')
      .field('viewport', '1920x1080')
      .field('browser', 'Chrome')
      .field('environment', 'staging')
      .attach('file', fs.createReadStream(mismatch))
      .expect(201);

    const result = await authRequest(app)
      .get('/api/v1/search?q=login-form')
      .expect(200);

    const branches = result.body.tests.map(
      (hit: { branchName: string }) => hit.branchName,
    );
    expect(branches).toHaveLength(2);
    expect(branches).toEqual(
      expect.arrayContaining(['main', 'feature/checkout']),
    );
  });

  it('caps each group at the requested limit', async () => {
    const result = await authRequest(app)
      .get('/api/v1/search?q=o&limit=1')
      .expect(200);

    expect(result.body.tests.length).toBeLessThanOrEqual(1);
    expect(result.body.branches.length).toBeLessThanOrEqual(1);
  });

  it('rejects an empty query', async () => {
    await authRequest(app).get('/api/v1/search?q=').expect(422);
  });
});
