import { INestApplication } from '@nestjs/common';
import fs from 'node:fs';
import path from 'node:path';
import { TestApp } from '../_support/utils/test-app';
import { authRequest } from '../_support/utils/authenticated-request';
import { PrismaConnection } from '@/prisma/prisma-connection';
import type { PrismaClient } from '@/prisma/client';

const FIXTURES = path.join(__dirname, '..', 'visualTest', 'fixtures');

function upload(app: INestApplication, file: string, threshold?: number) {
  const call = authRequest(app)
    .post('/api/v1/projects/cfg-thresholds/tests/login/upload?testKind=image')
    .field('viewport', '1920x1080')
    .field('browser', 'Chrome')
    .field('environment', 'staging');
  if (threshold !== undefined) {
    call.field('pixelDiffThreshold', String(threshold));
  }
  return call.attach('file', fs.createReadStream(path.join(FIXTURES, file)));
}

describe('Config-as-code thresholds (e2e)', () => {
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
    await TestApp.createProject('cfg-thresholds');
  });

  async function baselineThreshold(): Promise<number> {
    const baseline = await db.unifiedScreenshot.findFirstOrThrow({
      where: {
        type: 'BASELINE',
        test: { name: 'login' },
      },
    });
    return baseline.pixelDiffThreshold;
  }

  it('applies a threshold to a new baseline, tightens an existing one and ignores a raise', async () => {
    await upload(app, 'baseline_black.png', 25).expect(201);
    expect(await baselineThreshold()).toBe(25);

    // The second image differs, so a comparison is queued; the threshold is
    // lower and therefore applied.
    await upload(app, 'baseline_red.png', 10).expect(201);
    expect(await baselineThreshold()).toBe(10);

    // A higher value must not widen the gate: the baseline stays at 10.
    await upload(app, 'baseline_blue.png', 50).expect(201);
    expect(await baselineThreshold()).toBe(10);

    const audits = await db.auditEvent.findMany({
      where: { action: 'test.threshold', testName: 'login' },
      orderBy: { createdAt: 'asc' },
    });
    expect(
      audits.map((row) => (row.metadata as { source?: string }).source),
    ).toEqual(['config', 'config']);
    expect(audits[0]?.metadata).toEqual({
      from: null,
      to: 25,
      source: 'config',
    });
    expect(audits[1]?.metadata).toEqual({
      from: 25,
      to: 10,
      source: 'config',
    });
  }, 30_000);
});
