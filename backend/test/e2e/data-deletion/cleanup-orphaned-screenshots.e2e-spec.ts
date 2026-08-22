import { INestApplication } from '@nestjs/common';
import { PrismaConnection } from '@/prisma/prisma-connection';
import { MinioStorageService } from '@internal/storage/services/minio-storage.service';
import { OrphanCleanupService } from '@internal/data-deletion/services/orphan-cleanup.service';
import { TestApp } from '../_support/utils/test-app';
describe('OrphanCleanupService (integration)', () => {
  let app: INestApplication;
  let prisma: any;
  let cleanupService: OrphanCleanupService;

  beforeAll(async () => {
    app = await TestApp.init();
    prisma = app.get(PrismaConnection).client;
    cleanupService = app.get(OrphanCleanupService);
  });

  beforeEach(async () => {
    await TestApp.resetDb();
  });

  afterAll(async () => {
    await TestApp.close();
  });

  it('should delete orphaned CURRENT screenshots and corresponding MinIO objects', async () => {
    const deleteSpy = jest
      .spyOn(MinioStorageService.prototype, 'delete')
      .mockResolvedValue();

    const project = await prisma.project.create({
      data: { name: 'cleanup-demo' },
    });

    // Test with orphan CURRENT (no comparison) — will be deleted
    const orphanTest = await prisma.unifiedTest.create({
      data: {
        name: 'OrphanForm',
        projectId: project.id,
        kind: 'image',
        status: 'PENDING',
      },
    });

    await prisma.unifiedScreenshot.create({
      data: {
        testId: orphanTest.id,
        type: 'CURRENT',
        imageHash: 'hash-orphan',
        imageUrl: 'http://minio/orphan.png',
      },
    });

    // Test with non-orphan CURRENT (has comparison) — will stay
    const keptTest = await prisma.unifiedTest.create({
      data: {
        name: 'KeptForm',
        projectId: project.id,
        kind: 'image',
        status: 'PENDING',
      },
    });

    const baseline = await prisma.unifiedScreenshot.create({
      data: {
        testId: keptTest.id,
        type: 'BASELINE',
        imageHash: 'hash-baseline',
        imageUrl: 'http://minio/baseline.png',
      },
    });
    await prisma.unifiedVariant.create({
      data: {
        testId: keptTest.id,
        viewport: '1920x1080',
        browser: 'chrome',
        environment: 'staging',
        baselineId: baseline.id,
      },
    });

    const candidate = await prisma.unifiedScreenshot.create({
      data: {
        testId: keptTest.id,
        type: 'CURRENT',
        imageHash: 'hash-kept',
        imageUrl: 'http://minio/used.png',
      },
    });

    await prisma.unifiedComparison.create({
      data: {
        testId: keptTest.id,
        baselineId: baseline.id,
        candidateId: candidate.id,
        mismatchPixelCount: 50,
        diffImageUrl: 'http://minio/diff.png',
        status: 'PENDING_APPROVAL',
      },
    });

    const result = await cleanupService.deleteOrphanedScreenshots();

    expect(result.deleted).toBe(1);

    expect(deleteSpy).toHaveBeenCalledWith('http://minio/orphan.png');

    const remaining = await prisma.unifiedScreenshot.findMany({
      orderBy: { createdAt: 'asc' },
    });

    const remainingUrls = remaining.map(
      (r: { imageUrl: string }) => r.imageUrl,
    );
    expect(remainingUrls).toContain('http://minio/used.png');
    expect(remainingUrls).not.toContain('http://minio/orphan.png');
    expect(remainingUrls).toContain('http://minio/baseline.png');
  });
});
