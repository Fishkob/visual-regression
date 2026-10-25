import { INestApplication } from '@nestjs/common';
import { TestApp } from '../_support/utils/test-app';
import { waitForComparison } from '../_support/utils/wait-for-comparison';
import { PrismaConnection } from '@/prisma/prisma-connection';
import { ComparisonOutcome } from '@public/visualTest/core/domain/types/visual-test.types';
import {
  STORAGE_PROVIDER,
  IStorageProvider,
} from '@common/domain/storage-provider.interface';
import * as path from 'path';
import * as fs from 'fs';
import { authRequest } from '../_support/utils/authenticated-request';

describe('Approve PDF Test (e2e)', () => {
  let app: INestApplication;
  let prisma: any;
  let storage: IStorageProvider;

  const samplePdf = path.join(__dirname, 'fixtures', 'sample-v1.pdf');
  const sampleV2Pdf = path.join(__dirname, 'fixtures', 'sample-v2.pdf');

  const uploadUrl =
    '/api/v1/projects/pdf-approval/tests/invoice/upload?testKind=pdf';

  beforeAll(async () => {
    app = await TestApp.init();
    prisma = app.get(PrismaConnection).client;
    storage = app.get(STORAGE_PROVIDER);
  });

  beforeEach(async () => {
    await TestApp.resetDb();
    await TestApp.createProject('pdf-approval');
  });

  afterAll(async () => {
    await TestApp.close();
  });

  function upload(file: string) {
    return authRequest(app)
      .post(uploadUrl)
      .field('viewport', 'A4')
      .field('browser', 'pdf')
      .field('environment', 'production')
      .attach('file', fs.createReadStream(file));
  }

  async function uploadAndWaitForPending(): Promise<{
    diffUrl: string;
    comparisonId: string;
  }> {
    await upload(samplePdf).expect(201);

    const mismatch = await upload(sampleV2Pdf).expect(201);
    expect(mismatch.body.status).toBe(ComparisonOutcome.COMPARISON_QUEUED);

    await waitForComparison(app, 'pdf-approval', 'invoice', {
      viewport: 'A4',
      browser: 'pdf',
      environment: 'production',
    });

    const comparison = await prisma.unifiedComparison.findFirst({
      where: { status: 'PENDING_APPROVAL' },
    });
    expect(comparison).not.toBeNull();
    expect(comparison.diffPdfUrl).toBeTruthy();
    return { diffUrl: comparison.diffPdfUrl, comparisonId: comparison.id };
  }

  it('should approve the pending comparison and keep the comparison row as history', async () => {
    const { comparisonId } = await uploadAndWaitForPending();

    await authRequest(app)
      .post('/api/v1/projects/pdf-approval/tests/invoice/pdf-approval')
      .send({ comparisonId })
      .expect(201);

    const approved = await prisma.unifiedComparison.findFirst({
      where: { status: 'APPROVED' },
    });
    expect(approved).not.toBeNull();

    // The PDF approval keeps the comparison row but clears the diff reference.
    expect(approved.diffPdfUrl).toBeNull();

    // The candidate PDF becomes the new baseline.
    const baseline = await prisma.unifiedScreenshot.findFirst({
      where: { type: 'BASELINE' },
    });
    expect(baseline).not.toBeNull();
  });

  it('should delete the diff pdf file from storage after approval', async () => {
    const { diffUrl, comparisonId } = await uploadAndWaitForPending();
    expect(await storage.exists(diffUrl)).toBe(true);

    await authRequest(app)
      .post('/api/v1/projects/pdf-approval/tests/invoice/pdf-approval')
      .send({ comparisonId })
      .expect(201);

    expect(await storage.exists(diffUrl)).toBe(false);
  });

  it('should record the pdf approval in the audit trail for the caller', async () => {
    const { comparisonId } = await uploadAndWaitForPending();

    await authRequest(app)
      .post('/api/v1/projects/pdf-approval/tests/invoice/pdf-approval')
      .send({ comparisonId })
      .expect(201);

    const history = await authRequest(app)
      .get('/api/v1/projects/pdf-approval/tests/invoice/approvals')
      .expect(200);

    expect(history.body).toHaveLength(1);
    expect(history.body[0]).toMatchObject({
      approvedBy: 'e2e',
      comparisonId,
      testKind: 'pdf',
      branchName: null,
      variant: { viewport: 'A4', browser: 'pdf', environment: 'production' },
      approvedAt: expect.any(String),
    });
    expect(history.body[0].candidateHash).toEqual(expect.any(String));
    expect(history.body[0].baselineHash).toEqual(expect.any(String));
    expect(typeof history.body[0].pageCount).toBe('number');
  });

  it('should approve the pending pdf comparison through the bulk endpoint', async () => {
    const { comparisonId } = await uploadAndWaitForPending();

    const batch = await authRequest(app)
      .post(
        '/api/v1/projects/pdf-approval/tests/invoice/approvals/all?branch=main',
      )
      .expect(201);
    expect(batch.body).toEqual({ approved: 1, failed: [] });

    // The PDF kind keeps the comparison row as history (APPROVED) and promotes
    // the candidate PDF to the baseline.
    const approved = await prisma.unifiedComparison.findUnique({
      where: { id: comparisonId },
    });
    expect(approved).not.toBeNull();
    expect(approved.status).toBe('APPROVED');
    expect(approved.diffPdfUrl).toBeNull();

    const history = await authRequest(app)
      .get('/api/v1/projects/pdf-approval/tests/invoice/approvals?branch=main')
      .expect(200);
    expect(history.body).toHaveLength(1);
    expect(history.body[0]).toMatchObject({
      approvedBy: 'e2e',
      comparisonId,
      testKind: 'pdf',
      branchName: 'main',
    });
  });

  it('should treat the approved pdf as identical on a repeat upload', async () => {
    await upload(samplePdf).expect(201);

    const mismatch = await upload(sampleV2Pdf).expect(201);
    expect(mismatch.body.status).toBe(ComparisonOutcome.COMPARISON_QUEUED);
    const comparison = await waitForComparison(app, 'pdf-approval', 'invoice', {
      viewport: 'A4',
      browser: 'pdf',
      environment: 'production',
    });

    await authRequest(app)
      .post('/api/v1/projects/pdf-approval/tests/invoice/pdf-approval')
      .send({ comparisonId: comparison.body.comparison.id })
      .expect(201);

    const repeatUpload = await upload(sampleV2Pdf).expect(201);
    expect(repeatUpload.body.status).toBe(ComparisonOutcome.IDENTICAL);
  });
});
