import { INestApplication } from '@nestjs/common';
import { TestApp } from '../_support/utils/test-app';
import { PrismaConnection } from '@/prisma/prisma-connection';
import { TestStatus } from '@/prisma/client';
import { authRequest } from '../_support/utils/authenticated-request';

describe('VisualTest queries (e2e)', () => {
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

  describe('GET /projects/:projectName/tests', () => {
    it('should return tests for a project', async () => {
      const project = await prisma.project.create({
        data: { name: 'test-project' },
      });
      await prisma.unifiedTest.create({
        data: {
          name: 'LoginForm',
          projectId: project.id,
          kind: 'image',
          status: TestStatus.PENDING,
        },
      });
      await prisma.unifiedTest.create({
        data: {
          name: 'SignupForm',
          projectId: project.id,
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
      await prisma.project.create({ data: { name: 'empty-project' } });

      const res = await authRequest(app)
        .get('/api/v1/projects/empty-project/tests')
        .expect(200);

      expect(res.body.data).toEqual([]);
    });
  });
});
