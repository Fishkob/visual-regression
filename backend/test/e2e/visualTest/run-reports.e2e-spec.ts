import { INestApplication } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { TestApp } from '../_support/utils/test-app';
import { authRequest } from '../_support/utils/authenticated-request';
import { PrismaConnection } from '@/prisma/prisma-connection';
import type { PrismaClient } from '@/prisma/client';
import { waitForComparison } from '../_support/utils/wait-for-comparison';

const RUN_KEY = 'ci-42';
const VARIANT = {
  viewport: '1920x1080',
  browser: 'Chrome',
  environment: 'staging',
};

describe('Run reports (e2e)', () => {
  let app: INestApplication;
  let db: PrismaClient;
  const black = path.join(__dirname, 'fixtures', 'baseline_black.png');
  const blue = path.join(__dirname, 'fixtures', 'baseline_blue.png');

  beforeAll(async () => {
    app = await TestApp.init();
    db = app.get(PrismaConnection).client;
  });

  beforeEach(async () => {
    await TestApp.resetDb();
    await TestApp.createProject('checkout-ui');
  }, 30_000);

  afterAll(async () => {
    await TestApp.close();
  });

  function upload(testName: string, file: string) {
    return authRequest(app)
      .post(
        `/api/v1/projects/checkout-ui/tests/${testName}/upload?testKind=image`,
      )
      .field('viewport', VARIANT.viewport)
      .field('browser', VARIANT.browser)
      .field('environment', VARIANT.environment)
      .field('runKey', RUN_KEY)
      .field('commitSha', '9fceb02')
      .attach('file', fs.createReadStream(file));
  }

  // Two tests of one run whose second upload differs from their baseline: both
  // end up pending, which is what a run-level approval and the reports are for.
  async function seedPendingRun(): Promise<void> {
    for (const testName of ['login-form', 'signup-form']) {
      await upload(testName, black).expect(201);
      const queued = await upload(testName, blue).expect(201);
      expect(queued.body.runKey).toBe(RUN_KEY);
    }
    for (const testName of ['login-form', 'signup-form']) {
      const pending = await waitForComparison(
        app,
        'checkout-ui',
        testName,
        VARIANT,
      );
      expect(pending.body.comparison.status).toBe('PENDING_APPROVAL');
    }
  }

  function detail() {
    return authRequest(app).get(
      `/api/v1/projects/checkout-ui/runs/${RUN_KEY}?branch=main`,
    );
  }

  function status() {
    return authRequest(app).get(
      `/api/v1/projects/checkout-ui/runs/${RUN_KEY}/status?branch=main`,
    );
  }

  function report(kind: 'junit' | 'html' | 'csv') {
    return authRequest(app).get(
      `/api/v1/projects/checkout-ui/runs/${RUN_KEY}/report/${kind}?branch=main`,
    );
  }

  it('lists the run and reports its pending work', async () => {
    await seedPendingRun();

    const list = await authRequest(app)
      .get('/api/v1/projects/checkout-ui/runs?branch=main')
      .expect(200);
    expect(list.body.meta.total).toBe(1);
    expect(list.body.data).toHaveLength(1);
    expect(list.body.data[0]).toEqual(
      expect.objectContaining({
        id: expect.any(String),
        key: RUN_KEY,
        branchName: 'main',
        commitSha: '9fceb02',
        finishedAt: null,
        finishedBy: null,
      }),
    );

    const read = await detail().expect(200);
    expect(read.body.run).toEqual(
      expect.objectContaining({ key: RUN_KEY, branchName: 'main' }),
    );
    expect(read.body.status).toEqual(
      expect.objectContaining({
        state: 'pending',
        pendingComparisons: 2,
        mutedPending: 0,
        pendingJobs: 0,
        failedJobs: 0,
        approved: 0,
        testCount: 2,
      }),
    );
    expect(read.body.pending).toHaveLength(2);
    expect(read.body.pending).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          comparisonId: expect.any(String),
          testName: 'login-form',
          kind: 'image',
          branchName: 'main',
          variant: VARIANT,
          mismatchPixelCount: expect.any(Number),
          muted: false,
        }),
        expect.objectContaining({ testName: 'signup-form' }),
      ]),
    );
    expect(read.body.approvals).toEqual([]);
    expect(read.body.uploads).toHaveLength(4);
    expect(read.body.uploads).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          testName: 'signup-form',
          kind: 'image',
          variant: VARIANT,
          outcome: expect.any(String),
        }),
      ]),
    );
    expect(read.body.failedJobs).toEqual([]);
  });

  it('approves every pending comparison, finishes the run and reports it', async () => {
    await seedPendingRun();

    const approved = await authRequest(app)
      .post(
        `/api/v1/projects/checkout-ui/runs/${RUN_KEY}/approve-all?branch=main`,
      )
      .expect(200);
    expect(approved.body).toEqual({ approved: 2, failed: [] });

    // Approving empties the queue but the run is still open until it is finished.
    const open = await status().expect(200);
    expect(open.body.status).toEqual(
      expect.objectContaining({
        state: 'open',
        pendingComparisons: 0,
        approved: 2,
      }),
    );

    const finished = await authRequest(app)
      .post(`/api/v1/projects/checkout-ui/runs/${RUN_KEY}/finish?branch=main`)
      .expect(200);
    expect(finished.body.status).toEqual(
      expect.objectContaining({ state: 'passed' }),
    );
    expect(finished.body.run.finishedAt).toEqual(expect.any(String));
    expect(finished.body.run.finishedBy).toEqual(expect.any(String));

    const passed = await detail().expect(200);
    expect(passed.body.status.state).toBe('passed');
    expect(passed.body.pending).toEqual([]);
    expect(passed.body.approvals).toHaveLength(2);
    expect(passed.body.approvals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          comparisonId: expect.any(String),
          testName: 'login-form',
          approvedBy: 'e2e',
          approvedAt: expect.any(String),
        }),
      ]),
    );

    const junit = await report('junit').expect(200);
    expect(junit.headers['content-type']).toContain('application/xml');
    expect(junit.headers['content-disposition']).toContain('vrt-run.xml');
    expect(junit.text).toContain('<testsuite name="checkout-ui/ci-42"');
    expect(junit.text).toContain('failures="0"');
    expect(junit.text).toContain('login-form');
    expect(junit.text).toContain('signup-form');

    const html = await report('html').expect(200);
    expect(html.headers['content-type']).toContain('text/html');
    expect(html.text).toContain('<h1>checkout-ui / ci-42</h1>');
    expect(html.text).toContain('login-form');
    expect(html.text).toContain('signup-form');
    expect(html.text).toContain('approved');

    const csv = await report('csv').expect(200);
    expect(csv.headers['content-type']).toContain('text/csv');
    const [header, ...rows] = csv.text.trimEnd().split('\n');
    expect(header).toBe(
      'project,runKey,branch,test,kind,variant,outcome,mismatch,detail',
    );
    expect(rows).toHaveLength(2);
    expect(csv.text).toContain(
      '"checkout-ui","ci-42","main","login-form","image"',
    );
    expect(csv.text).toContain('"approved"');
    expect(rows.some((row) => row.includes('signup-form'))).toBe(true);

    // Approval rows carry the run key, so the trail survives the comparison rows
    // that approval deletes.
    await expect(
      db.approval.count({ where: { runKey: RUN_KEY } }),
    ).resolves.toBe(2);
  });

  it('treats a failed comparison job as a run failure', async () => {
    await seedPendingRun();
    const detailRow = await detail().expect(200);
    const run = await db.run.findFirstOrThrow({
      where: { key: RUN_KEY },
    });
    const test = await db.unifiedTest.findFirstOrThrow({
      where: { name: 'login-form', branchId: run.branchId },
    });
    await db.comparisonJob.create({
      data: {
        testId: test.id,
        runId: run.id,
        runKey: RUN_KEY,
        payload: { testName: 'login-form' },
        status: 'FAILED',
        error: 'comparison worker exploded',
      },
    });
    expect(detailRow.body.run.id).toBe(run.id);

    const failed = await detail().expect(200);
    expect(failed.body.status).toEqual(
      expect.objectContaining({ state: 'failed', failedJobs: 1 }),
    );
    expect(failed.body.failedJobs).toEqual([
      expect.objectContaining({
        testName: 'login-form',
        branchName: 'main',
        error: 'comparison worker exploded',
      }),
    ]);

    // Pending review and a failed job are both JUnit failures; the job row is
    // named separately so a consumer can tell them apart.
    const junit = await report('junit').expect(200);
    expect(junit.text).toContain('tests="3" failures="3"');
    expect(junit.text).toContain(
      '<failure message="comparison worker exploded">',
    );

    const csv = await report('csv').expect(200);
    expect(csv.text).toContain('"failed"');
    expect(csv.text).toContain('"comparison worker exploded"');
  });

  it('answers 404 for an unknown run on every run read', async () => {
    for (const endpoint of [
      '/api/v1/projects/checkout-ui/runs/missing',
      '/api/v1/projects/checkout-ui/runs/missing/status',
      '/api/v1/projects/checkout-ui/runs/missing/report/junit',
      '/api/v1/projects/checkout-ui/runs/missing/report/html',
      '/api/v1/projects/checkout-ui/runs/missing/report/csv',
    ]) {
      await authRequest(app).get(`${endpoint}?branch=main`).expect(404);
    }

    await authRequest(app)
      .post('/api/v1/projects/checkout-ui/runs/missing/finish?branch=main')
      .expect(404);
    await authRequest(app)
      .post('/api/v1/projects/checkout-ui/runs/missing/approve-all?branch=main')
      .expect(404);
  });
});
