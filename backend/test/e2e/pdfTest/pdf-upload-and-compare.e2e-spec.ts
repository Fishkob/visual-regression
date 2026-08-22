import { INestApplication } from '@nestjs/common';
import { TestApp } from '../_support/utils/test-app';
import { waitForComparison } from '../_support/utils/wait-for-comparison';
import { PrismaConnection } from '@/prisma/prisma-connection';
import { ComparisonOutcome } from '@public/visualTest/core/domain/types/visual-test.types';
import * as path from 'path';
import * as fs from 'fs';
import request from 'supertest';

describe('PdfTest upload and compare (e2e)', () => {
  let app: INestApplication;
  let prisma: any;

  beforeAll(async () => {
    app = await TestApp.init();
    prisma = app.get(PrismaConnection).client;
  });

  beforeEach(async () => {
    await TestApp.resetDb();
    await prisma.project.create({ data: { name: 'pdf-proj' } });
  });

  afterAll(async () => {
    await TestApp.close();
  });

  it('should create baseline on first PDF upload', async () => {
    const pdfPath = path.join(__dirname, 'fixtures', 'sample-v1.pdf');

    const res = await request(app.getHttpServer())
      .post('/api/v1/projects/pdf-proj/tests/report/upload?testKind=pdf')
      .field('viewport', 'A4')
      .field('browser', 'pdf')
      .field('environment', 'production')
      .attach('file', fs.createReadStream(pdfPath))
      .expect(201);

    expect(res.body.status).toBe(ComparisonOutcome.BASELINE_CREATED);
  });

  it('should queue comparison on second PDF upload', async () => {
    const pdfPath = path.join(__dirname, 'fixtures', 'sample-v1.pdf');
    const pdfV2Path = path.join(__dirname, 'fixtures', 'sample-v2.pdf');

    await request(app.getHttpServer())
      .post('/api/v1/projects/pdf-proj/tests/report/upload?testKind=pdf')
      .field('viewport', 'A4')
      .field('browser', 'pdf')
      .field('environment', 'production')
      .attach('file', fs.createReadStream(pdfPath))
      .expect(201);

    const res = await request(app.getHttpServer())
      .post('/api/v1/projects/pdf-proj/tests/report/upload?testKind=pdf')
      .field('viewport', 'A4')
      .field('browser', 'pdf')
      .field('environment', 'production')
      .attach('file', fs.createReadStream(pdfV2Path))
      .expect(201);

    expect(res.body.status).toBe(ComparisonOutcome.COMPARISON_QUEUED);

    const details = await waitForComparison(app, 'pdf-proj', 'report', {
      viewport: 'A4',
      browser: 'pdf',
      environment: 'production',
    });

    expect(details.body.comparison).toBeDefined();
    expect(details.body.comparison.status).toMatch(
      /^(PENDING_APPROVAL|APPROVED|UNCHANGED)$/,
    );
  });

  it('should detect identical PDFs via content hash', async () => {
    const pdfPath = path.join(__dirname, 'fixtures', 'sample-v1.pdf');

    await request(app.getHttpServer())
      .post('/api/v1/projects/pdf-proj/tests/report/upload?testKind=pdf')
      .field('viewport', 'A4')
      .field('browser', 'pdf')
      .field('environment', 'production')
      .attach('file', fs.createReadStream(pdfPath))
      .expect(201);

    const res = await request(app.getHttpServer())
      .post('/api/v1/projects/pdf-proj/tests/report/upload?testKind=pdf')
      .field('viewport', 'A4')
      .field('browser', 'pdf')
      .field('environment', 'production')
      .attach('file', fs.createReadStream(pdfPath))
      .expect(201);

    expect(res.body.status).toBe(ComparisonOutcome.IDENTICAL);
  });
});
