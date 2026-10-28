import { INestApplication } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { TestApp } from '../_support/utils/test-app';
import { authRequest } from '../_support/utils/authenticated-request';
import { PrismaConnection } from '@/prisma/prisma-connection';
import type { PrismaClient } from '@/prisma/client';
import {
  STORAGE_PROVIDER,
  type IStorageProvider,
} from '@common/domain/storage-provider.interface';

describe('Branch management (e2e)', () => {
  let app: INestApplication;
  let db: PrismaClient;
  let storage: IStorageProvider;
  const black = path.join(
    __dirname,
    '..',
    'visualTest',
    'fixtures',
    'baseline_black.png',
  );
  const blue = path.join(
    __dirname,
    '..',
    'visualTest',
    'fixtures',
    'baseline_blue.png',
  );

  beforeAll(async () => {
    app = await TestApp.init();
    db = app.get(PrismaConnection).client;
    storage = app.get(STORAGE_PROVIDER);
  });

  beforeEach(async () => {
    await TestApp.resetDb();
    await TestApp.createProject('branch-app');
  }, 30_000);

  afterAll(async () => {
    await TestApp.close();
  });

  function upload(
    options: {
      branch?: string;
      targetBranch?: string;
      testName?: string;
      file?: string;
    } = {},
  ) {
    const request = authRequest(app).post(
      `/api/v1/projects/branch-app/tests/${options.testName ?? 'login'}/upload?testKind=image`,
    );
    if (options.branch) request.field('branch', options.branch);
    if (options.targetBranch)
      request.field('targetBranch', options.targetBranch);
    return request
      .field('viewport', '1920x1080')
      .field('browser', 'chromium')
      .field('environment', 'staging')
      .attach('file', fs.createReadStream(options.file ?? black));
  }

  function listBranches(query: Record<string, string> = {}) {
    return authRequest(app)
      .get('/api/v1/projects/branch-app/branches')
      .query(query);
  }

  function patchBranch(branchName: string, body: Record<string, unknown>) {
    return authRequest(app)
      .patch('/api/v1/projects/branch-app/branches')
      .query({ branch: branchName })
      .send(body);
  }

  function deleteBranch(branchName: string) {
    return authRequest(app)
      .delete('/api/v1/projects/branch-app/branches')
      .query({ branch: branchName });
  }

  async function branchNamed(name: string) {
    const response = await listBranches({ includeArchived: 'true' }).expect(
      200,
    );
    return response.body.find(
      (branch: { name: string }) => branch.name === name,
    );
  }

  it('lists the default branch next to the feature branches', async () => {
    await upload({ file: black }).expect(201);
    await upload({ branch: 'feature/a', file: blue }).expect(201);
    await upload({
      branch: 'feature/b',
      targetBranch: 'feature/a',
      file: black,
    }).expect(201);

    const response = await listBranches().expect(200);
    expect(response.body).toHaveLength(3);
    expect(response.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'main',
          isDefault: true,
          isArchived: false,
          targetBranchName: null,
          testCount: 1,
          pendingCount: 0,
          createdAt: expect.any(String),
        }),
        expect.objectContaining({
          name: 'feature/a',
          isDefault: false,
          // No explicit target: the branch inherits from the project default.
          targetBranchName: 'main',
          testCount: 1,
        }),
        expect.objectContaining({
          name: 'feature/b',
          targetBranchName: 'feature/a',
        }),
      ]),
    );
  });

  it('retargets a branch and archives it', async () => {
    await upload({ branch: 'feature/a', file: black }).expect(201);
    await upload({ branch: 'feature/b', file: blue }).expect(201);

    await patchBranch('feature/b', { targetBranch: 'feature/a' }).expect(200);
    expect(await branchNamed('feature/b')).toEqual(
      expect.objectContaining({ targetBranchName: 'feature/a' }),
    );

    // Targeting the default branch is stored as "no explicit target", which the
    // read resolves back to the default's name.
    await patchBranch('feature/b', { targetBranch: 'main' }).expect(200);
    expect(await branchNamed('feature/b')).toEqual(
      expect.objectContaining({ targetBranchName: 'main' }),
    );

    const archived = await patchBranch('feature/b', {
      isArchived: true,
    }).expect(200);
    expect(archived.body).toEqual({ success: true });
    expect(await branchNamed('feature/b')).toEqual(
      expect.objectContaining({ isArchived: true }),
    );
    expect(
      (await listBranches().expect(200)).body.map(
        (branch: { name: string }) => branch.name,
      ),
    ).toEqual(['main', 'feature/a']);

    await patchBranch('feature/b', { isArchived: false }).expect(200);
    expect(await branchNamed('feature/b')).toEqual(
      expect.objectContaining({ isArchived: false }),
    );
  });

  it('rejects an unknown branch, unknown target and default-branch update', async () => {
    await upload({ branch: 'feature/a', file: black }).expect(201);

    await patchBranch('feature/missing', { isArchived: true }).expect(404);
    await patchBranch('feature/a', { targetBranch: 'feature/missing' }).expect(
      404,
    );
    // The default branch is not a feature branch: it is modified on the project.
    await patchBranch('main', { isArchived: true }).expect(409);
    await deleteBranch('feature/missing').expect(404);
  });

  it('deletes a leaf branch with its tests, variants and screenshots', async () => {
    await upload({ file: black }).expect(201);
    await upload({
      branch: 'feature/gone',
      testName: 'branch-only',
      file: blue,
    }).expect(201);

    const branch = await db.branch.findFirstOrThrow({
      where: { name: 'feature/gone' },
    });
    expect(await branchNamed('feature/gone')).toEqual(
      expect.objectContaining({ name: 'feature/gone', testCount: 1 }),
    );
    const test = await db.unifiedTest.findFirstOrThrow({
      where: { name: 'branch-only' },
    });
    const variant = await db.unifiedVariant.findFirstOrThrow({
      where: { testId: test.id },
    });
    const screenshots = await db.unifiedScreenshot.findMany({
      where: { testId: test.id },
    });
    expect(screenshots.length).toBeGreaterThan(0);

    const deleted = await deleteBranch('feature/gone').expect(200);
    expect(deleted.body).toEqual({ success: true });

    expect(await branchNamed('feature/gone')).toBeUndefined();
    await expect(
      db.unifiedTest.count({ where: { id: test.id } }),
    ).resolves.toBe(0);
    await expect(
      db.unifiedVariant.count({ where: { id: variant.id } }),
    ).resolves.toBe(0);
    await expect(
      db.unifiedScreenshot.count({ where: { testId: test.id } }),
    ).resolves.toBe(0);

    // The default branch is untouched and still serves its own test.
    const main = await authRequest(app)
      .get('/api/v1/projects/branch-app/tests/login')
      .query({
        viewport: '1920x1080',
        browser: 'chromium',
        environment: 'staging',
      })
      .expect(200);
    expect(main.body.baseline).toBeDefined();

    const audit = await db.auditEvent.findMany({
      where: { action: 'branch.delete', targetId: branch.id },
    });
    expect(audit).toHaveLength(1);
    expect(audit[0]).toEqual(
      expect.objectContaining({ actor: 'e2e', branchName: 'feature/gone' }),
    );
  });

  it('refuses to delete the default branch or a branch with dependents', async () => {
    await upload({ file: black }).expect(201);
    await upload({ branch: 'feature/parent', file: blue }).expect(201);
    await upload({ branch: 'feature/child', file: black }).expect(201);
    await patchBranch('feature/child', {
      targetBranch: 'feature/parent',
    }).expect(200);

    const defaultBranch = await deleteBranch('main').expect(409);
    expect(defaultBranch.body.message).toBe(
      'The default branch cannot be deleted',
    );

    const dependent = await deleteBranch('feature/parent').expect(409);
    expect(dependent.body.message).toContain(
      'is the target of "feature/child"',
    );

    // Clearing the target makes the deletion legal.
    await patchBranch('feature/child', { targetBranch: null }).expect(200);
    await deleteBranch('feature/parent').expect(200);
    expect(await branchNamed('main')).toEqual(
      expect.objectContaining({ isDefault: true }),
    );
  });

  it("keeps the target's files when an inherited-only branch is deleted", async () => {
    await upload({ file: black }).expect(201);
    const mainBaseline = (
      await authRequest(app)
        .get('/api/v1/projects/branch-app/tests/login')
        .query({
          viewport: '1920x1080',
          browser: 'chromium',
          environment: 'staging',
        })
        .expect(200)
    ).body.baseline.imageUrl as string;
    await expect(storage.exists(mainBaseline)).resolves.toBe(true);

    // The branch materialises only `other`, so `login` stays inherited: its
    // screenshots are rows that point at main's objects.
    await upload({
      branch: 'feature/empty',
      testName: 'other',
      file: blue,
    }).expect(201);

    const inherited = await authRequest(app)
      .get('/api/v1/projects/branch-app/tests')
      .query({ branch: 'feature/empty' })
      .expect(200);
    expect(inherited.body.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'login',
          origin: 'inherited',
          inheritedFrom: 'main',
        }),
      ]),
    );

    await deleteBranch('feature/empty').expect(200);

    await expect(storage.exists(mainBaseline)).resolves.toBe(true);
    const main = await authRequest(app)
      .get('/api/v1/projects/branch-app/tests/login')
      .query({
        viewport: '1920x1080',
        browser: 'chromium',
        environment: 'staging',
      })
      .expect(200);
    expect(main.body.baseline.imageUrl).toBe(mainBaseline);
  });
});
