import { INestApplication } from '@nestjs/common';
import { TestApp } from '../_support/utils/test-app';
import { ConfigService } from '@nestjs/config';
import { PrismaConnection } from '@/prisma/prisma-connection';
import { ComparisonStatus, TestStatus } from '@/prisma/client';
import request from 'supertest';

describe('ProjectsController (e2e)', () => {
  let app: INestApplication;
  let prisma: any;

  beforeAll(async () => {
    app = await TestApp.init();
    prisma = app.get(PrismaConnection).client;
  });

  afterAll(async () => {
    await TestApp.close();
  });

  beforeEach(async () => {
    await TestApp.resetDb();
  }, 30_000);

  it('should create a new project successfully', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/projects')
      .send({ name: 'checkout-ui' })
      .expect(201);

    expect(res.body).toHaveProperty('id');
    expect(res.body.name).toBe('checkout-ui');
  });

  it('should fail with 400 if name is missing', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/projects')
      .send({})
      .expect(422);
  });

  it('should fail with 400 if name is empty', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/projects')
      .send({ name: '' })
      .expect(422);
  });

  it('should return 409 if project with same name exists', async () => {
    await prisma.project.create({ data: { name: 'duplicate' } });

    await request(app.getHttpServer())
      .post('/api/v1/projects')
      .send({ name: 'duplicate' })
      .expect(409);
  });

  it('should return projects with hasPending = true or false', async () => {
    const project = await prisma.project.create({
      data: { name: 'checkout-ui' },
    });

    const test = await prisma.unifiedTest.create({
      data: {
        name: 'LoginForm',
        projectId: project.id,
        kind: 'image',
        status: TestStatus.PENDING,
      },
    });

    const baseline = await prisma.unifiedScreenshot.create({
      data: {
        testId: test.id,
        type: 'BASELINE',
        imageHash: 'abc',
        imageUrl: 'http://rustfs/base.png',
      },
    });
    await prisma.unifiedVariant.create({
      data: {
        testId: test.id,
        viewport: '1920x1080',
        browser: 'Chrome',
        environment: 'staging',
        baselineId: baseline.id,
      },
    });

    const candidate = await prisma.unifiedScreenshot.create({
      data: {
        testId: test.id,
        type: 'CURRENT',
        imageHash: 'def',
        imageUrl: 'http://rustfs/curr.png',
      },
    });

    await prisma.unifiedComparison.create({
      data: {
        testId: test.id,
        baselineId: baseline.id,
        candidateId: candidate.id,
        mismatchPixelCount: 123,
        diffImageUrl: 'http://rustfs/diff.png',
        status: ComparisonStatus.PENDING_APPROVAL,
      },
    });

    const res = await request(app.getHttpServer())
      .get('/api/v1/projects/pending')
      .expect(200);

    expect(res.body.data).toBeInstanceOf(Array);
    expect(res.body.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: project.id,
          name: project.name,
          pending: true,
          createdAt: expect.any(String),
        }),
      ]),
    );
  });

  it('should return hasPending = false when no comparisons exist', async () => {
    const project = await prisma.project.create({
      data: { name: 'no-pending' },
    });

    const res = await request(app.getHttpServer())
      .get('/api/v1/projects/pending')
      .expect(200);

    expect(res.body.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: project.id,
          name: project.name,
          pending: false,
          createdAt: expect.any(String),
        }),
      ]),
    );
  });

  it('should delete a project and its related data', async () => {
    const config = app.get(ConfigService);
    const baseUrl = config.getOrThrow<string>('RUSTFS_PUBLIC_URL');
    const bucket = config.getOrThrow<string>('RUSTFS_BUCKET');

    const imageUrl = `${baseUrl}/${bucket}/baseline.png`;
    const currUrl = `${baseUrl}/${bucket}/current.png`;
    const diffUrl = `${baseUrl}/${bucket}/diff.png`;

    // Arrange – project + test + screenshot + comparison
    const project = await prisma.project.create({
      data: { name: 'checkout-ui' },
    });

    const test = await prisma.unifiedTest.create({
      data: {
        name: 'LoginForm',
        projectId: project.id,
        kind: 'image',
        status: TestStatus.PENDING,
      },
    });

    const baseline = await prisma.unifiedScreenshot.create({
      data: {
        testId: test.id,
        type: 'BASELINE',
        imageHash: 'abc',
        imageUrl,
      },
    });
    await prisma.unifiedVariant.create({
      data: {
        testId: test.id,
        viewport: '1920x1080',
        browser: 'Chrome',
        environment: 'staging',
        baselineId: baseline.id,
      },
    });

    const candidate = await prisma.unifiedScreenshot.create({
      data: {
        testId: test.id,
        type: 'CURRENT',
        imageHash: 'def',
        imageUrl: currUrl,
      },
    });

    await prisma.unifiedComparison.create({
      data: {
        testId: test.id,
        baselineId: baseline.id,
        candidateId: candidate.id,
        mismatchPixelCount: 200,
        diffImageUrl: diffUrl,
        status: ComparisonStatus.PENDING_APPROVAL,
      },
    });

    // Act – delete project
    const res = await request(app.getHttpServer())
      .delete(`/api/v1/projects/${project.name}`)
      .expect(200);

    expect(res.body).toEqual({ success: true });

    const remaining = await prisma.project.findUnique({
      where: { name: project.name },
    });
    expect(remaining).toBeNull();

    const remainingTests = await prisma.unifiedTest.findMany({
      where: { projectId: project.id },
    });
    expect(remainingTests).toHaveLength(0);

    const screenshots = await prisma.unifiedScreenshot.findMany({
      where: { testId: test.id },
    });
    expect(screenshots).toHaveLength(0);

    const comparisons = await prisma.unifiedComparison.findMany({
      where: { testId: test.id },
    });
    expect(comparisons).toHaveLength(0);
  });

  it('should delete a specific test from a project', async () => {
    const config = app.get(ConfigService);
    const baseUrl = config.getOrThrow<string>('RUSTFS_PUBLIC_URL');
    const bucket = config.getOrThrow<string>('RUSTFS_BUCKET');

    const baselineUrl = `${baseUrl}/${bucket}/baseline.png`;
    const candidateUrl = `${baseUrl}/${bucket}/candidate.png`;
    const diffUrl = `${baseUrl}/${bucket}/diff.png`;

    // Setup
    const project = await prisma.project.create({
      data: { name: 'checkout-ui' },
    });

    const test = await prisma.unifiedTest.create({
      data: {
        name: 'LoginForm',
        projectId: project.id,
        kind: 'image',
        status: TestStatus.PENDING,
      },
    });

    const baseline = await prisma.unifiedScreenshot.create({
      data: {
        testId: test.id,
        type: 'BASELINE',
        imageHash: 'hash1',
        imageUrl: baselineUrl,
      },
    });
    await prisma.unifiedVariant.create({
      data: {
        testId: test.id,
        viewport: '1920x1080',
        browser: 'Chrome',
        environment: 'staging',
        baselineId: baseline.id,
      },
    });

    const candidate = await prisma.unifiedScreenshot.create({
      data: {
        testId: test.id,
        type: 'CURRENT',
        imageHash: 'hash2',
        imageUrl: candidateUrl,
      },
    });

    await prisma.unifiedComparison.create({
      data: {
        testId: test.id,
        baselineId: baseline.id,
        candidateId: candidate.id,
        mismatchPixelCount: 42,
        diffImageUrl: diffUrl,
        status: ComparisonStatus.PENDING_APPROVAL,
      },
    });

    const res = await request(app.getHttpServer())
      .delete(`/api/v1/projects/${project.name}/tests/${test.name}`)
      .expect(200);

    expect(res.body).toEqual({ success: true, scope: 'test' });

    const deletedTest = await prisma.unifiedTest.findUnique({
      where: { id: test.id },
    });
    expect(deletedTest).toBeNull();

    const screenshots = await prisma.unifiedScreenshot.findMany({
      where: { testId: test.id },
    });
    expect(screenshots).toHaveLength(0);

    const comparisons = await prisma.unifiedComparison.findMany({
      where: { testId: test.id },
    });
    expect(comparisons).toHaveLength(0);
  });

  it('should return 404 when deleting a non-existing project', async () => {
    await request(app.getHttpServer())
      .delete('/api/v1/projects/does-not-exist')
      .expect(404);
  });

  it('should return 404 when fetching a non-existing project', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/projects/does-not-exist')
      .expect(404);
  });

  it('should return project details for existing project', async () => {
    const project = await prisma.project.create({
      data: { name: 'my-project' },
    });

    const res = await request(app.getHttpServer())
      .get(`/api/v1/projects/${project.name}`)
      .expect(200);

    expect(res.body.id).toBe(project.id);
    expect(res.body.name).toBe(project.name);
  });

  it('should return paginated project list', async () => {
    await prisma.project.create({ data: { name: 'project-a' } });
    await prisma.project.create({ data: { name: 'project-b' } });

    const res = await request(app.getHttpServer())
      .get('/api/v1/projects')
      .expect(200);

    expect(res.body.data).toBeInstanceOf(Array);
    expect(res.body.data.length).toBeGreaterThanOrEqual(2);
    expect(res.body.meta).toHaveProperty('total');
    expect(res.body.meta).toHaveProperty('page');
  });
});
