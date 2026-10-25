import { INestApplication } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { TestApp } from '../_support/utils/test-app';
import { authRequest } from '../_support/utils/authenticated-request';
import { PrismaConnection } from '@/prisma/prisma-connection';

describe('Run grouping (e2e)', () => {
  let app: INestApplication;
  let prisma: {
    run: { count: (args?: unknown) => Promise<number> };
    runUpload: { count: (args?: unknown) => Promise<number> };
  };

  const baseline = path.join(__dirname, 'fixtures', 'baseline_black.png');

  beforeAll(async () => {
    app = await TestApp.init();
    prisma = app.get(PrismaConnection).client as never;
  });

  beforeEach(async () => {
    await TestApp.resetDb();
    await TestApp.createProject('checkout-ui');
  });

  afterAll(async () => {
    await TestApp.close();
  });

  async function uploadTest(testName: string, runKey?: string) {
    const request = authRequest(app)
      .post(
        `/api/v1/projects/checkout-ui/tests/${testName}/upload?testKind=image`,
      )
      .field('viewport', '1920x1080')
      .field('browser', 'Chrome')
      .field('environment', 'staging')
      .attach('file', fs.createReadStream(baseline));
    if (runKey) {
      request
        .field('runKey', runKey)
        .field('commitSha', '9fceb02')
        .field('commitMessage', 'feat: checkout v2')
        .field('ciUrl', 'https://ci.example.com/runs/1');
    }
    return request.expect(201);
  }

  it('groups two uploads under one run and gates on its status', async () => {
    const first = await uploadTest('login-form', 'ci-1');
    const second = await uploadTest('signup-form', 'ci-1');

    expect(first.body.runKey).toBe('ci-1');
    expect(second.body.runKey).toBe('ci-1');

    const list = await authRequest(app)
      .get('/api/v1/projects/checkout-ui/runs?branch=main')
      .expect(200);
    expect(list.body.meta.total).toBe(1);
    expect(list.body.data).toHaveLength(1);
    expect(list.body.data[0]).toEqual(
      expect.objectContaining({
        key: 'ci-1',
        branchName: 'main',
        commitSha: '9fceb02',
        commitMessage: 'feat: checkout v2',
        ciUrl: 'https://ci.example.com/runs/1',
        finishedAt: null,
      }),
    );

    const before = await authRequest(app)
      .get('/api/v1/projects/checkout-ui/runs/ci-1/status?branch=main')
      .expect(200);
    expect(before.body.status).toEqual(
      expect.objectContaining({
        state: 'open',
        pendingComparisons: 0,
        pendingJobs: 0,
        failedJobs: 0,
        testCount: 2,
      }),
    );

    const finished = await authRequest(app)
      .post('/api/v1/projects/checkout-ui/runs/ci-1/finish?branch=main')
      .expect(200);
    expect(finished.body.status.state).toBe('passed');
    expect(finished.body.run.finishedAt).toEqual(expect.any(String));
    expect(finished.body.run.finishedBy).toEqual(expect.any(String));

    const detail = await authRequest(app)
      .get('/api/v1/projects/checkout-ui/runs/ci-1?branch=main')
      .expect(200);
    expect(detail.body.pending).toEqual([]);
    expect(detail.body.approvals).toEqual([]);
    expect(detail.body.status.state).toBe('passed');
  });

  it('keeps uploads without a run key outside every run', async () => {
    const result = await uploadTest('login-form');
    expect(result.body.runKey).toBeUndefined();

    const list = await authRequest(app)
      .get('/api/v1/projects/checkout-ui/runs?branch=main')
      .expect(200);
    expect(list.body.meta.total).toBe(0);
  });

  it('cascades runs and their uploads when the project is deleted', async () => {
    await uploadTest('login-form', 'ci-1');
    await uploadTest('signup-form', 'ci-1');
    expect(await prisma.run.count()).toBe(1);
    expect(await prisma.runUpload.count()).toBe(2);

    await authRequest(app).delete('/api/v1/projects/checkout-ui').expect(200);

    expect(await prisma.run.count()).toBe(0);
    expect(await prisma.runUpload.count()).toBe(0);
  });

  it('returns 404 for an unknown run', async () => {
    await authRequest(app)
      .get('/api/v1/projects/checkout-ui/runs/missing/status?branch=main')
      .expect(404);
  });
});
