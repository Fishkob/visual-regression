import { INestApplication } from '@nestjs/common';
import { TestApp } from '../_support/utils/test-app';
import { PrismaConnection } from '@/prisma/prisma-connection';
import { TestStatus } from '@/prisma/client';
import { authRequest } from '../_support/utils/authenticated-request';
import type { PrismaClient } from '@/prisma/client';

describe('VisualTest queries (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;

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

  describe('GET /projects/:projectName/tests', () => {
    it('should return tests for a project', async () => {
      const { branchId } = await TestApp.createProject('test-project');
      await prisma.unifiedTest.create({
        data: {
          name: 'LoginForm',
          branchId,
          kind: 'image',
          status: TestStatus.PENDING,
        },
      });
      await prisma.unifiedTest.create({
        data: {
          name: 'SignupForm',
          branchId,
          kind: 'image',
          status: TestStatus.UNCHANGED,
        },
      });

      const res = await authRequest(app)
        .get('/api/v1/projects/test-project/tests')
        .expect(200);

      expect(res.body.data).toBeInstanceOf(Array);
      expect(res.body.data).toHaveLength(2);
      expect(res.body.meta).toHaveProperty('total');
    });

    it('should return empty list for project with no tests', async () => {
      await TestApp.createProject('empty-project');

      const res = await authRequest(app)
        .get('/api/v1/projects/empty-project/tests')
        .expect(200);

      expect(res.body.data).toEqual([]);
    });
  });
});
