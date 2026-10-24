import { INestApplication } from '@nestjs/common';
import { TestApp } from '../_support/utils/test-app';
import { PrismaConnection } from '@/prisma/prisma-connection';
import { TestStatus } from '@/prisma/client';
import { authRequest } from '../_support/utils/authenticated-request';

describe('PdfTest queries (e2e)', () => {
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
    it('should return list of tests for a project', async () => {
      const { branchId } = await TestApp.createProject('proj');
      await prisma.unifiedTest.create({
        data: {
          name: 'InvoiceReport',
          branchId,
          status: TestStatus.PENDING,
        },
      });
      await prisma.unifiedTest.create({
        data: {
          name: 'TaxReport',
          branchId,
          status: TestStatus.UNCHANGED,
        },
      });

      const res = await authRequest(app)
        .get('/api/v1/projects/proj/tests')
        .expect(200);

      expect(res.body.data).toBeInstanceOf(Array);
      expect(res.body.data).toHaveLength(2);
      expect(res.body.data[0]).toHaveProperty('name');
      expect(res.body.data[0]).toHaveProperty('kind');
    });

    it('should return empty array for project with no tests', async () => {
      await TestApp.createProject('empty-proj');

      const res = await authRequest(app)
        .get('/api/v1/projects/empty-proj/tests')
        .expect(200);

      expect(res.body.data).toEqual([]);
    });

    it('should return 404 for non-existent project', async () => {
      const res = await authRequest(app)
        .get('/api/v1/projects/nonexistent/tests')
        .expect(404);

      expect(res.body.message).toContain('nonexistent');
    });
  });

  describe('GET /projects/:projectName/tests/:testName/kind', () => {
    it('should return pdf kind when a PDF test exists', async () => {
      const { branchId } = await TestApp.createProject('kind-proj');
      await prisma.unifiedTest.create({
        data: { name: 'MyPDF', branchId, kind: 'pdf' },
      });

      const res = await authRequest(app)
        .get('/api/v1/projects/kind-proj/tests/MyPDF/kind')
        .expect(200);

      expect(res.body).toEqual({ kind: 'pdf' });
    });

    it('should return image kind when only a visual test exists', async () => {
      const { branchId } = await TestApp.createProject('kind-proj2');
      await prisma.unifiedTest.create({
        data: { name: 'MyVisual', branchId, kind: 'image' },
      });

      const res = await authRequest(app)
        .get('/api/v1/projects/kind-proj2/tests/MyVisual/kind')
        .expect(200);

      expect(res.body).toEqual({ kind: 'image' });
    });

    it('should return 404 when no test exists for the name', async () => {
      await TestApp.createProject('kind-proj3');

      await authRequest(app)
        .get('/api/v1/projects/kind-proj3/tests/Nonexistent/kind')
        .expect(404);
    });

    it('should return 404 when project does not exist', async () => {
      await authRequest(app)
        .get('/api/v1/projects/nonexistent/tests/Anything/kind')
        .expect(404);
    });
  });

  describe('GET /projects/:projectName/tests/:testName/pdf-details', () => {
    it('should return test details with baseline', async () => {
      const { branchId } = await TestApp.createProject('detail-proj');
      const test = await prisma.unifiedTest.create({
        data: { name: 'DetailTest', branchId, kind: 'pdf' },
      });
      const screenshot = await prisma.unifiedScreenshot.create({
        data: {
          testId: test.id,
          type: 'BASELINE',
          imageHash: 'abc123',
          imageUrl: 'http://rustfs/report.pdf',
          pageCount: 3,
        },
      });
      await prisma.unifiedVariant.create({
        data: {
          testId: test.id,
          viewport: '1920x1080',
          browser: 'Chrome',
          environment: 'staging',
          baselineId: screenshot.id,
        },
      });

      const res = await authRequest(app)
        .get('/api/v1/projects/detail-proj/tests/DetailTest/pdf-details')
        .query({ viewport: '1920x1080' })
        .expect(200);

      expect(res.body).toHaveProperty('id', test.id);
      expect(res.body).toHaveProperty('name', 'DetailTest');
      expect(res.body.baseline).not.toBeNull();
      expect(res.body.comparison).toBeNull();
    });

    it('should return test details with baseline and comparison', async () => {
      const { branchId } = await TestApp.createProject('detail-proj2');
      const test = await prisma.unifiedTest.create({
        data: { name: 'CompareTest', branchId, kind: 'pdf' },
      });
      const baseline = await prisma.unifiedScreenshot.create({
        data: {
          testId: test.id,
          type: 'BASELINE',
          imageHash: 'baseline-hash',
          imageUrl: 'http://rustfs/baseline.pdf',
          pageCount: 5,
        },
      });
      await prisma.unifiedVariant.create({
        data: {
          testId: test.id,
          viewport: '1280x720',
          browser: 'Firefox',
          environment: 'production',
          baselineId: baseline.id,
        },
      });
      const candidate = await prisma.unifiedScreenshot.create({
        data: {
          testId: test.id,
          type: 'CURRENT',
          imageHash: 'candidate-hash',
          imageUrl: 'http://rustfs/candidate.pdf',
          pageCount: 5,
        },
      });
      await prisma.unifiedComparison.create({
        data: {
          testId: test.id,
          baselineId: baseline.id,
          candidateId: candidate.id,
          pageCount: 5,
          mismatchPixelCount: 0,
          mismatchPageCount: 2,
          diffImageUrl: '',
          diffPdfUrl: 'http://rustfs/diff.pdf',
          status: 'PENDING_APPROVAL',
        },
      });

      const res = await authRequest(app)
        .get('/api/v1/projects/detail-proj2/tests/CompareTest/pdf-details')
        .query({ viewport: '1280x720' })
        .expect(200);

      expect(res.body.baseline).not.toBeNull();
      expect(res.body.comparison).not.toBeNull();
      expect(res.body.comparison.status).toBe('PENDING_APPROVAL');
      expect(res.body.comparison.candidate).not.toBeNull();
    });

    it('should return null baseline when test has no variant', async () => {
      const { branchId } = await TestApp.createProject('detail-proj3');
      await prisma.unifiedTest.create({
        data: { name: 'NoVariant', branchId, kind: 'pdf' },
      });

      const res = await authRequest(app)
        .get('/api/v1/projects/detail-proj3/tests/NoVariant/pdf-details')
        .query({ viewport: '1920x1080' })
        .expect(200);

      expect(res.body.baseline).toBeNull();
      expect(res.body.comparison).toBeNull();
      expect(res.body.name).toBe('NoVariant');
    });

    it('should return null baseline when variant has no baseline', async () => {
      const { branchId } = await TestApp.createProject('detail-proj4');
      const test = await prisma.unifiedTest.create({
        data: { name: 'EmptyVariant', branchId, kind: 'pdf' },
      });
      await prisma.unifiedVariant.create({
        data: {
          testId: test.id,
          viewport: '1024x768',
          browser: 'Chrome',
          environment: 'staging',
        },
      });

      const res = await authRequest(app)
        .get('/api/v1/projects/detail-proj4/tests/EmptyVariant/pdf-details')
        .query({ viewport: '1024x768' })
        .expect(200);

      expect(res.body.baseline).toBeNull();
      expect(res.body.comparison).toBeNull();
    });

    it('should filter by viewport', async () => {
      const { branchId } = await TestApp.createProject('filter-proj');
      const test = await prisma.unifiedTest.create({
        data: { name: 'FilterTest', branchId, kind: 'pdf' },
      });
      const baseline = await prisma.unifiedScreenshot.create({
        data: {
          testId: test.id,
          type: 'BASELINE',
          imageHash: 'desktop',
          imageUrl: 'http://rustfs/desktop.pdf',
          pageCount: 1,
        },
      });
      await prisma.unifiedVariant.create({
        data: {
          testId: test.id,
          viewport: '375x667',
          browser: 'Safari',
          environment: 'staging',
          baselineId: baseline.id,
        },
      });

      const res = await authRequest(app)
        .get('/api/v1/projects/filter-proj/tests/FilterTest/pdf-details')
        .query({ viewport: '375x667' })
        .expect(200);

      expect(res.body.baseline).not.toBeNull();
    });

    it('should return 404 when test does not exist', async () => {
      // A real project (with its default branch): the 404 must come from the
      // missing test, not from a project that has no default branch.
      await TestApp.createProject('detail-proj5');

      await authRequest(app)
        .get('/api/v1/projects/detail-proj5/tests/Nonexistent/pdf-details')
        .query({ viewport: '1920x1080' })
        .expect(404);
    });

    it('should return 404 when project does not exist', async () => {
      await authRequest(app)
        .get('/api/v1/projects/nonexistent/tests/Anything/pdf-details')
        .query({ viewport: '1920x1080' })
        .expect(404);
    });

    it('should return 400 when no variant filter is provided', async () => {
      const { branchId } = await TestApp.createProject('detail-proj6');
      await prisma.unifiedTest.create({
        data: { name: 'Unfiltered', branchId, kind: 'pdf' },
      });

      await authRequest(app)
        .get('/api/v1/projects/detail-proj6/tests/Unfiltered/pdf-details')
        .expect(400);
    });
  });

  describe('GET /projects/:projectName/tests/:testName/pdf-download', () => {
    it('should reject invalid type with 400', async () => {
      const { branchId } = await TestApp.createProject('dl-proj');
      await prisma.unifiedTest.create({
        data: { name: 'any', branchId, kind: 'pdf' },
      });

      await authRequest(app)
        .get('/api/v1/projects/dl-proj/tests/any/pdf-download')
        .query({ type: 'invalid', viewport: '1920x1080' })
        .expect(400);
    });

    it('should return 404 when test has no baseline', async () => {
      const { branchId } = await TestApp.createProject('dl-proj2');
      await prisma.unifiedTest.create({
        data: { name: 'NoBaseline', branchId, kind: 'pdf' },
      });

      await authRequest(app)
        .get('/api/v1/projects/dl-proj2/tests/NoBaseline/pdf-download')
        .query({ type: 'baseline', viewport: '1920x1080' })
        .expect(404);
    });

    it('should return 404 when test does not exist', async () => {
      await TestApp.createProject('dl-proj3');

      await authRequest(app)
        .get('/api/v1/projects/dl-proj3/tests/Nonexistent/pdf-download')
        .query({ type: 'baseline', viewport: '1920x1080' })
        .expect(404);
    });

    it('should reject pdfUrl from a different project with 403', async () => {
      const { branchId: branchA } = await TestApp.createProject('dl-proj-a');
      const testA = await prisma.unifiedTest.create({
        data: { name: 'TestA', branchId: branchA, kind: 'pdf' },
      });
      const screenshotA = await prisma.unifiedScreenshot.create({
        data: {
          testId: testA.id,
          type: 'BASELINE',
          imageHash: 'hash123',
          imageUrl: 'http://localhost:9000/vrt/project-a/report.pdf',
          pageCount: 1,
        },
      });
      const { branchId: branchB } = await TestApp.createProject('dl-proj-b');
      const testB = await prisma.unifiedTest.create({
        data: { name: 'TestB', branchId: branchB, kind: 'pdf' },
      });
      await prisma.unifiedVariant.create({
        data: {
          testId: testB.id,
          viewport: '1920x1080',
          browser: 'Chrome',
          environment: 'staging',
          baselineId: screenshotA.id,
        },
      });

      await authRequest(app)
        .get('/api/v1/projects/dl-proj-b/tests/TestB/pdf-download')
        .query({ type: 'baseline', viewport: '1920x1080' })
        .expect(403);
    });

    it('should reject pdfUrl from a different test within same project with 403', async () => {
      const { branchId } = await TestApp.createProject('dl-proj-same');
      const testOne = await prisma.unifiedTest.create({
        data: { name: 'TestOne', branchId, kind: 'pdf' },
      });
      const screenshotOne = await prisma.unifiedScreenshot.create({
        data: {
          testId: testOne.id,
          type: 'BASELINE',
          imageHash: 'hash456',
          imageUrl: 'http://localhost:9000/vrt/same-proj/report.pdf',
          pageCount: 1,
        },
      });
      const testTwo = await prisma.unifiedTest.create({
        data: { name: 'TestTwo', branchId, kind: 'pdf' },
      });
      await prisma.unifiedVariant.create({
        data: {
          testId: testTwo.id,
          viewport: '1920x1080',
          browser: 'Chrome',
          environment: 'staging',
          baselineId: screenshotOne.id,
        },
      });

      await authRequest(app)
        .get('/api/v1/projects/dl-proj-same/tests/TestTwo/pdf-download')
        .query({ type: 'baseline', viewport: '1920x1080' })
        .expect(403);
    });

    it('should return 400 when no variant filter is provided', async () => {
      const { branchId } = await TestApp.createProject('dl-proj4');
      await prisma.unifiedTest.create({
        data: { name: 'Unfiltered', branchId, kind: 'pdf' },
      });

      await authRequest(app)
        .get('/api/v1/projects/dl-proj4/tests/Unfiltered/pdf-download')
        .query({ type: 'baseline' })
        .expect(400);
    });
  });

  describe('GET /projects/:projectName/tests/:testName/pdf-render', () => {
    it('should reject missing pdfUrl with 400', async () => {
      await authRequest(app)
        .get('/api/v1/projects/any/tests/any/pdf-render')
        .query({ page: 1 })
        .expect(400);
    });

    it('should reject missing page parameter with 400', async () => {
      await authRequest(app)
        .get('/api/v1/projects/any/tests/any/pdf-render')
        .query({ pdfUrl: 'http://rustfs/test.pdf' })
        .expect(400);
    });

    it('should reject an unknown test with 404', async () => {
      await authRequest(app)
        .get('/api/v1/projects/any/tests/any/pdf-render')
        .query({ pdfUrl: 'not-a-valid-url', page: 1 })
        .expect(404);
    });

    it('should reject a pdfUrl the existing test does not own with 403', async () => {
      const { branchId } = await TestApp.createProject('render-proj');
      await prisma.unifiedTest.create({
        data: { name: 'Owned', branchId, kind: 'pdf' },
      });

      await authRequest(app)
        .get('/api/v1/projects/render-proj/tests/Owned/pdf-render')
        .query({ pdfUrl: 'not-a-valid-url', page: 1 })
        .expect(403);
    });

    it('should reject pdfUrl from a different project with 403', async () => {
      const { branchId: branchA } = await TestApp.createProject('project-a');
      const testA = await prisma.unifiedTest.create({
        data: { name: 'TestA', branchId: branchA, kind: 'pdf' },
      });
      const { branchId: branchB } = await TestApp.createProject('project-b');
      const testB = await prisma.unifiedTest.create({
        data: { name: 'TestB', branchId: branchB, kind: 'pdf' },
      });
      await prisma.unifiedScreenshot.create({
        data: {
          testId: testA.id,
          type: 'BASELINE',
          imageHash: 'hash123',
          imageUrl: 'http://localhost:9000/vrt/project-a/report.pdf',
          pageCount: 3,
        },
      });

      await authRequest(app)
        .get('/api/v1/projects/project-b/tests/TestB/pdf-render')
        .query({
          pdfUrl: 'http://localhost:9000/vrt/project-a/report.pdf',
          page: 1,
        })
        .expect(403);
    });

    it('should reject pdfUrl from a different test within the same project with 403', async () => {
      const { branchId } = await TestApp.createProject('same-proj');
      const testOne = await prisma.unifiedTest.create({
        data: { name: 'TestOne', branchId, kind: 'pdf' },
      });
      const testTwo = await prisma.unifiedTest.create({
        data: { name: 'TestTwo', branchId, kind: 'pdf' },
      });
      await prisma.unifiedScreenshot.create({
        data: {
          testId: testOne.id,
          type: 'BASELINE',
          imageHash: 'hash456',
          imageUrl: 'http://localhost:9000/vrt/same-proj/report.pdf',
          pageCount: 3,
        },
      });

      await authRequest(app)
        .get('/api/v1/projects/same-proj/tests/TestTwo/pdf-render')
        .query({
          pdfUrl: 'http://localhost:9000/vrt/same-proj/report.pdf',
          page: 1,
        })
        .expect(403);
    });
  });
});
