import { INestApplication } from '@nestjs/common';
import { TestApp } from '../_support/utils/test-app';
import { waitForComparison } from '../_support/utils/wait-for-comparison';
import { PrismaConnection } from '@/prisma/prisma-connection';
import * as path from 'path';
import * as fs from 'fs';
import { authRequest } from '../_support/utils/authenticated-request';
import type { PrismaClient } from '@/prisma/client';

const projectName = 'checkout-ui';
const testName = 'pending-check';
const baselinePath = path.join(
  __dirname,
  '../visualTest/fixtures/baseline_black.png',
);
const mismatchPath = path.join(
  __dirname,
  '../visualTest/fixtures/baseline_blue.png',
);

describe('Project Pending Status (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  beforeAll(async () => {
    app = await TestApp.init();
    prisma = app.get(PrismaConnection).client;
  });

  beforeEach(async () => {
    await TestApp.resetDb();
    await TestApp.createProject(projectName);
  });

  afterAll(async () => {
    await TestApp.close();
  });

  it('should toggle project.pending from true to false after approval', async () => {
    // Upload baseline
    await authRequest(app)
      .post(
        `/api/v1/projects/${projectName}/tests/${testName}/upload?testKind=image`,
      )
      .field('viewport', '1920x1080')
      .field('browser', 'Chrome')
      .field('environment', 'staging')
      .attach('file', fs.createReadStream(baselinePath))
      .expect(201);

    // Upload mismatch → returns 201 with DIFFERENT status
    await authRequest(app)
      .post(
        `/api/v1/projects/${projectName}/tests/${testName}/upload?testKind=image`,
      )
      .field('viewport', '1920x1080')
      .field('browser', 'Chrome')
      .field('environment', 'staging')
      .attach('file', fs.createReadStream(mismatchPath))
      .expect(201);

    // Wait for the poller to process the comparison
    const comparison = await waitForComparison(app, projectName, testName);

    // Get project → pending should be true
    const beforeApprove = await authRequest(app)
      .get(`/api/v1/projects/pending`)
      .expect(200);

    expect(beforeApprove.body.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: projectName,
          pending: true,
        }),
      ]),
    );

    // Approve the pinned comparison
    await authRequest(app)
      .post(`/api/v1/projects/${projectName}/tests/${testName}/approval`)
      .send({ comparisonId: comparison.body.comparison.id })
      .expect(201);

    // Get project again → pending should now be false
    const afterApprove = await authRequest(app)
      .get(`/api/v1/projects/pending`)
      .expect(200);

    expect(afterApprove.body.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: projectName,
          pending: false,
        }),
      ]),
    );
  });
});
