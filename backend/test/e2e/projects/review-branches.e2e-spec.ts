import { INestApplication } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { TestApp } from '../_support/utils/test-app';
import { authRequest } from '../_support/utils/authenticated-request';
import { waitForComparison } from '../_support/utils/wait-for-comparison';
import { PrismaConnection } from '@/prisma/prisma-connection';
import type { PrismaClient } from '@/prisma/client';

describe('Review inbox branches (e2e)', () => {
  let app: INestApplication;
  let db: PrismaClient;
  const black = path.join(
    __dirname,
    '..',
    'visualTest',
    'fixtures',
    'baseline_black.png',
  );
  const blue = path.join(
    __dirname,
    '..',
    'visualTest',
    'fixtures',
    'baseline_blue.png',
  );

  beforeAll(async () => {
    app = await TestApp.init();
    db = app.get(PrismaConnection).client;
  });

  beforeEach(async () => {
    await TestApp.resetDb();
    await TestApp.createProject('alpha');
    await TestApp.createProject('beta');
  }, 30_000);

  afterAll(async () => {
    await TestApp.close();
  });

  function upload(
    projectName: string,
    options: { branch?: string; file: string; testName?: string } = {
      file: black,
    },
  ) {
    const request = authRequest(app).post(
      `/api/v1/projects/${projectName}/tests/${options.testName ?? 'login'}/upload?testKind=image`,
    );
    if (options.branch) request.field('branch', options.branch);
    return request
      .field('viewport', '1920x1080')
      .field('browser', 'Chrome')
      .field('environment', 'staging')
      .attach('file', fs.createReadStream(options.file));
  }

  async function pendingOn(projectName: string, branch?: string) {
    await upload(projectName, { branch, file: black }).expect(201);
    await upload(projectName, { branch, file: blue }).expect(201);
    return waitForComparison(app, projectName, 'login', undefined, branch);
  }

  function branches() {
    return authRequest(app).get('/api/v1/review/branches');
  }

  it('lists the distinct pending branches across projects', async () => {
    await pendingOn('alpha');
    await pendingOn('beta');
    const feature = await pendingOn('beta', 'feature/x');
    expect(feature.body.comparison.id).toBeDefined();

    const response = await branches().expect(200);
    // Sorted, deduplicated by name: `main` is pending in both projects but the
    // filter offers the branch name once.
    expect(response.body).toEqual(['feature/x', 'main']);
  });

  it('drops a branch once its comparisons are approved', async () => {
    const pending = await pendingOn('alpha');

    await authRequest(app)
      .post('/api/v1/projects/alpha/tests/login/approval')
      .send({ comparisonId: pending.body.comparison.id })
      .expect(201);

    await branches().expect(200, []);
  });

  it('excludes archived branches', async () => {
    await pendingOn('alpha', 'feature/old');

    await authRequest(app)
      .patch('/api/v1/projects/alpha/branches')
      .query({ branch: 'feature/old' })
      .send({ isArchived: true })
      .expect(200);

    // The comparison is still pending, but a branch nobody works on must not
    // offer itself as an inbox filter.
    await branches().expect(200, []);
    await expect(
      db.unifiedComparison.count({ where: { status: 'PENDING_APPROVAL' } }),
    ).resolves.toBe(1);
  });

  it('answers an empty list when nothing is pending', async () => {
    await upload('alpha', { file: black }).expect(201);

    await branches().expect(200, []);
  });
});
