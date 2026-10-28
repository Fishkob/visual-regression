import { INestApplication } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { TestApp } from '../_support/utils/test-app';
import { authRequest } from '../_support/utils/authenticated-request';
import { PrismaConnection } from '@/prisma/prisma-connection';
import type { PrismaClient } from '@/prisma/client';
import { waitForComparison } from '../_support/utils/wait-for-comparison';

const VARIANT = {
  viewport: '1920x1080',
  browser: 'Chrome',
  environment: 'staging',
};

describe('Baseline restore (e2e)', () => {
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
    await TestApp.createProject('shop');
  }, 30_000);

  afterAll(async () => {
    await TestApp.close();
  });

  function upload(file: string, branch?: string) {
    const request = authRequest(app).post(
      '/api/v1/projects/shop/tests/login/upload?testKind=image',
    );
    if (branch) request.field('branch', branch);
    return request
      .field('viewport', VARIANT.viewport)
      .field('browser', VARIANT.browser)
      .field('environment', VARIANT.environment)
      .attach('file', fs.createReadStream(file));
  }

  function details(branch?: string) {
    return authRequest(app)
      .get('/api/v1/projects/shop/tests/login')
      .query({ ...VARIANT, ...(branch ? { branch } : {}) });
  }

  async function approveLatest(branch?: string) {
    const comparison = await waitForComparison(
      app,
      'shop',
      'login',
      VARIANT,
      branch,
    );
    const request = authRequest(app).post(
      '/api/v1/projects/shop/tests/login/approval',
    );
    if (branch) request.query({ branch });
    await request
      .send({ comparisonId: comparison.body.comparison.id })
      .expect(201);
    return comparison.body.comparison.id as string;
  }

  function history(branch?: string) {
    return authRequest(app)
      .get('/api/v1/projects/shop/tests/login/baseline-history')
      .query({ ...VARIANT, ...(branch ? { branch } : {}) });
  }

  function restore(revisionId: string, branch?: string) {
    const request = authRequest(app).post(
      '/api/v1/projects/shop/tests/login/baseline-restore',
    );
    if (branch) request.query({ branch });
    return request.send({ revisionId });
  }

  it('lists the replaced baseline and restores it over the approved one', async () => {
    await upload(black).expect(201);
    const firstBaseline = (await details()).body.baseline.imageUrl as string;

    await upload(blue).expect(201);
    await approveLatest();
    const approvedBaseline = (await details()).body.baseline.imageUrl as string;
    expect(approvedBaseline).not.toBe(firstBaseline);

    const list = await history().expect(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0]).toEqual(
      expect.objectContaining({
        id: expect.any(String),
        imageUrl: firstBaseline,
        imageHash: expect.any(String),
        reason: 'approval',
        viewport: VARIANT.viewport,
        browser: VARIANT.browser,
        environment: VARIANT.environment,
        createdBy: 'e2e',
        createdAt: expect.any(String),
        signedImageUrl: expect.any(String),
      }),
    );
    const revisionId = list.body[0].id as string;

    const restored = await restore(revisionId).expect(201);
    expect(restored.body).toEqual({
      baselineUrl: firstBaseline,
      signedBaselineUrl: expect.any(String),
    });

    const afterRestore = await details().expect(200);
    expect(afterRestore.body.baseline.imageUrl).toBe(firstBaseline);

    const after = await history().expect(200);
    expect(after.body).toHaveLength(2);
    expect(after.body[0]).toEqual(
      expect.objectContaining({
        imageUrl: approvedBaseline,
        reason: 'restore',
        createdBy: 'e2e',
      }),
    );

    const test = await db.unifiedTest.findFirstOrThrow({
      where: { name: 'login' },
    });
    const audit = await db.auditEvent.findMany({
      where: { action: 'baseline.restore', targetId: test.id },
    });
    expect(audit).toHaveLength(1);
    expect(audit[0]).toEqual(
      expect.objectContaining({
        actor: 'e2e',
        projectName: 'shop',
        testName: 'login',
        targetType: 'test',
      }),
    );
    expect(audit[0]!.metadata).toEqual(expect.objectContaining({ revisionId }));
  });

  it('rejects restoring the revision that is already the baseline', async () => {
    await upload(black).expect(201);
    await upload(blue).expect(201);
    await approveLatest();
    const revisionId = (await history().expect(200)).body[0].id as string;

    await restore(revisionId).expect(201);

    const conflict = await restore(revisionId).expect(409);
    expect(conflict.body).toEqual(
      expect.objectContaining({
        message: 'That revision is already the current baseline',
      }),
    );
  });

  it('retires the pending comparison computed against the replaced baseline', async () => {
    await upload(black).expect(201);
    await upload(blue).expect(201);
    await approveLatest();
    // The restore candidate recorded by the approval above: its image is the
    // one the pending comparison must not be compared against.
    const older = (await history().expect(200)).body[0].id as string;

    // A third upload differs from the (blue) baseline and is waiting for review.
    await upload(black).expect(201);
    const pending = await waitForComparison(app, 'shop', 'login', VARIANT);
    expect(pending.body.comparison.status).toBe('PENDING_APPROVAL');

    await restore(older).expect(201);

    const retired = await details().expect(200);
    expect(retired.body.comparison).toBeUndefined();

    const variants = await authRequest(app)
      .get('/api/v1/projects/shop/tests/login/variants')
      .expect(200);
    expect(variants.body.variants).toEqual([
      expect.objectContaining({
        ...VARIANT,
        status: 'UNCHANGED',
        candidateUrl: null,
        mismatchPixelCount: null,
      }),
    ]);
    await expect(
      db.unifiedComparison.count({ where: { status: 'PENDING_APPROVAL' } }),
    ).resolves.toBe(0);
  });

  it('answers 404 for an unknown revision', async () => {
    await upload(black).expect(201);

    await restore('does-not-exist').expect(404);
  });

  it('refuses to restore a baseline on an inherited branch', async () => {
    await upload(black).expect(201);
    await upload(blue, 'feature/x').expect(201);

    // An inherited clone belongs to the target branch; restoring it here would
    // silently fork ownership, so it is a CONFLICT.
    const revisions = await db.baselineRevision.findMany();
    expect(revisions).toHaveLength(0);

    const test = await db.unifiedTest.findFirstOrThrow({
      where: { name: 'login', branch: { name: 'feature/x' } },
    });
    const variant = await db.unifiedVariant.findFirstOrThrow({
      where: { testId: test.id, ...VARIANT },
    });
    expect(variant.isInherited).toBe(true);
    const revision = await db.baselineRevision.create({
      data: {
        testId: test.id,
        variantId: variant.id,
        ...VARIANT,
        imageUrl: (await details()).body.baseline.imageUrl as string,
        imageHash: 'inherited-hash',
        reason: 'approval',
        createdBy: 'e2e',
      },
    });

    const conflict = await restore(revision.id, 'feature/x').expect(409);
    expect(conflict.body.message).toBe(
      'Inherited baselines cannot be restored on this branch',
    );
  });
});
