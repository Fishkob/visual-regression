import { INestApplication } from '@nestjs/common';
import { PrismaConnection } from '@/prisma/prisma-connection';
import { TestApp } from '../_support/utils/test-app';

describe('ComparisonJob cleanup on VisualTest delete', () => {
  let app: INestApplication;
  let prisma: any;

  beforeAll(async () => {
    app = await TestApp.init();
    prisma = app.get(PrismaConnection).client;
  });

  beforeEach(async () => {
    await TestApp.resetDb();
  });

  afterAll(async () => {
    await TestApp.close();
  });

  it('should delete ComparisonJobs by testId', async () => {
    const project = await prisma.project.create({
      data: { name: 'cascade-test' },
    });

    const test = await prisma.unifiedTest.create({
      data: {
        name: 'login-form',
        projectId: project.id,
        kind: 'image',
        status: 'PENDING',
      },
    });

    await prisma.comparisonJob.create({
      data: {
        testId: test.id,
        payload: { testId: test.id, some: 'data' },
      },
    });

    await prisma.comparisonJob.deleteMany({
      where: { testId: test.id },
    });

    const jobs = await prisma.comparisonJob.findMany({
      where: { testId: test.id },
    });

    expect(jobs.length).toBe(0);
  });
});
