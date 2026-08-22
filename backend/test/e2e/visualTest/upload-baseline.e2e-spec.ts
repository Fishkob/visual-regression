import { INestApplication } from '@nestjs/common';
import { TestApp } from '../_support/utils/test-app';
import { PrismaConnection } from '@/prisma/prisma-connection';
import { ComparisonOutcome } from '@public/visualTest/core/domain/types/visual-test.types';
import * as path from 'path';
import * as fs from 'fs';
import request from 'supertest';

describe('Upload Baseline (e2e)', () => {
  let app: INestApplication;
  let prisma: any;

  beforeAll(async () => {
    app = await TestApp.init();
    prisma = app.get(PrismaConnection).client;
  });

  beforeEach(async () => {
    await TestApp.resetDb();
    await prisma.project.create({ data: { name: 'checkout-ui' } });
  });

  afterAll(async () => {
    await TestApp.close();
  });

  it('should upload a baseline screenshot', async () => {
    const filePath = path.join(__dirname, 'fixtures', 'baseline_black.png');
    const file = fs.createReadStream(filePath);

    const res = await request(app.getHttpServer())
      .post(
        '/api/v1/projects/checkout-ui/tests/LoginForm1/upload?testKind=image',
      )
      .field('viewport', '1920x1080')
      .field('browser', 'Chrome')
      .field('environment', 'staging')
      .attach('file', file)
      .expect(201);

    expect(res.body.status).toBe(ComparisonOutcome.BASELINE_CREATED);
    expect(res.body.fileUrl).toMatch(/^http/);
  });

  it('should return 400 when uploading a non-image file', async () => {
    const txtFile = Buffer.from('this is not an image');
    await request(app.getHttpServer())
      .post('/api/v1/projects/checkout-ui/tests/invalid/upload?testKind=image')
      .field('viewport', '1920x1080')
      .field('browser', 'Chrome')
      .field('environment', 'staging')
      .attach('file', txtFile, {
        filename: 'test.txt',
        contentType: 'text/plain',
      })
      .expect(400);
  });
});
