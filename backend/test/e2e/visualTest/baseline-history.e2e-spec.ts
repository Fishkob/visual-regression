import { INestApplication } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { TestApp } from '../_support/utils/test-app';
import { authRequest } from '../_support/utils/authenticated-request';
import { PrismaConnection } from '@/prisma/prisma-connection';
import { PrismaClient } from '@/prisma/client';
import { waitForComparison } from '../_support/utils/wait-for-comparison';
import {
  STORAGE_PROVIDER,
  type IStorageProvider,
} from '@common/domain/storage-provider.interface';
import {
  STORAGE_OBJECT_REFERENCEDNESS,
  type IStorageObjectReferencedness,
} from '@common/domain/storage-referencedness.interface';
import { OrphanCleanupService } from '@internal/data-deletion/services/orphan-cleanup.service';
import { UnreferencedObjectCleanupTask } from '@internal/data-deletion/tasks/unreferenced-object-cleanup.task';

describe('Baseline history retention (e2e)', () => {
  let app: INestApplication;
  let db: PrismaClient;
  let storage: IStorageProvider;
  const baseline = path.join(__dirname, 'fixtures', 'baseline_black.png');
  const blue = path.join(__dirname, 'fixtures', 'baseline_blue.png');

  beforeAll(async () => {
    app = await TestApp.init();
    db = app.get(PrismaConnection).client;
    storage = app.get(STORAGE_PROVIDER);
  });

  beforeEach(async () => {
    await TestApp.resetDb();
    await TestApp.createProject('shop');
  }, 30_000);

  afterAll(async () => {
    await TestApp.close();
  });

  function upload(file: string) {
    return authRequest(app)
      .post('/api/v1/projects/shop/tests/login/upload?testKind=image')
      .field('viewport', '1920x1080')
      .field('browser', 'Chrome')
      .field('environment', 'staging')
      .attach('file', fs.createReadStream(file));
  }

  async function approveLatest() {
    const comparison = await waitForComparison(app, 'shop', 'login');
    await authRequest(app)
      .post('/api/v1/projects/shop/tests/login/approval')
      .send({ comparisonId: comparison.body.comparison.id })
      .expect(201);
  }

  async function revisions() {
    return db.baselineRevision.findMany({
      orderBy: { createdAt: 'asc' },
      select: { id: true, imageUrl: true, reason: true, createdBy: true },
    });
  }

  it('keeps two readable revisions after two approvals and prunes beyond the limit', async () => {
    await upload(baseline).expect(201);
    await upload(blue).expect(201);
    await approveLatest();

    await upload(baseline).expect(201);
    await approveLatest();

    const two = await revisions();
    expect(two).toHaveLength(2);
    expect(two.every((row) => row.reason === 'approval')).toBe(true);
    for (const revision of two) {
      await expect(storage.get(revision.imageUrl)).resolves.toBeInstanceOf(
        Buffer,
      );
    }

    await db.project.update({
      where: { name: 'shop' },
      data: { baselineRevisionLimit: 1 },
    });

    await upload(blue).expect(201);
    await approveLatest();

    const pruned = await revisions();
    expect(pruned).toHaveLength(1);
    expect(pruned[0]!.imageUrl).not.toBe(two[0]!.imageUrl);
    await expect(storage.get(pruned[0]!.imageUrl)).resolves.toBeInstanceOf(
      Buffer,
    );
  });

  it('sweeps do not reclaim revision-referenced files', async () => {
    await upload(baseline).expect(201);
    await upload(blue).expect(201);
    await approveLatest();
    const [revision] = await revisions();
    expect(revision).toBeDefined();

    const referencedness = app.get<IStorageObjectReferencedness>(
      STORAGE_OBJECT_REFERENCEDNESS,
    );
    await expect(
      referencedness.findReferencedUrls([revision!.imageUrl]),
    ).resolves.toEqual([revision!.imageUrl]);

    await app.get(OrphanCleanupService).deleteOrphanedScreenshots();
    await app.get(UnreferencedObjectCleanupTask).execute();

    await expect(storage.exists(revision!.imageUrl)).resolves.toBe(true);
    expect(await revisions()).toHaveLength(1);
  });
});
