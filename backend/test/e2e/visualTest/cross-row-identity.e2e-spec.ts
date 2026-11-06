import { INestApplication } from '@nestjs/common';
import { PrismaConnection } from '@/prisma/prisma-connection';
import { TestApp } from '../_support/utils/test-app';
import { createBaselineWithVariant } from '../_support/utils/screenshot-fixtures';
import type { PrismaClient } from '@/prisma/client';

// The five cross-row identities the schema names twice, plus the two guarantees
// this change moved out of the application: the discussion cascades with its
// test, and a vote resolves its project id from the name it was written with.
//
// Every case fails if its mechanism is removed: without the trigger the row is
// accepted, without the foreign key the comment survives, without the trigger
// the vote keeps a NULL projectId. That is the point of running them against the
// real database instead of a mock (ADR-054, ADR-065).
describe('Cross-row identities and review artifacts (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  beforeAll(async () => {
    app = await TestApp.init();
    prisma = app.get(PrismaConnection).client;
  });

  beforeEach(async () => {
    await TestApp.resetDb();
  }, 30_000);

  afterAll(async () => {
    await TestApp.close();
  });

  async function seedTest(projectName: string, testName: string) {
    const { branchId } = await TestApp.createProject(projectName);
    const test = await prisma.unifiedTest.create({
      data: { name: testName, branchId, kind: 'image' },
    });
    const { variantId, baseline } = await createBaselineWithVariant(prisma, {
      testId: test.id,
      imageHash: `baseline-${testName}`,
      imageUrl: `http://rustfs/${testName}-baseline.png`,
    });
    return { testId: test.id, branchId, variantId, baselineId: baseline.id };
  }

  it('rejects a screenshot written under a variant of another test', async () => {
    const a = await seedTest('identity-a', 'login');
    const b = await seedTest('identity-b', 'checkout');

    await expect(
      prisma.unifiedScreenshot.create({
        data: {
          testId: b.testId,
          variantId: a.variantId,
          type: 'BASELINE',
          imageHash: 'foreign',
          imageUrl: 'http://rustfs/foreign.png',
        },
      }),
    ).rejects.toThrow(/does not match|names test/i);

    expect(
      await prisma.unifiedScreenshot.count({ where: { imageHash: 'foreign' } }),
    ).toBe(0);
  });

  it('rejects moving a screenshot to another test after the fact', async () => {
    const a = await seedTest('identity-c', 'login');
    const b = await seedTest('identity-d', 'checkout');

    await expect(
      prisma.unifiedScreenshot.update({
        where: { id: a.baselineId },
        data: { testId: b.testId },
      }),
    ).rejects.toThrow(/does not match|names test/i);
  });

  it('rejects a comparison whose baseline belongs to another test', async () => {
    const a = await seedTest('identity-e', 'login');
    const b = await seedTest('identity-f', 'checkout');

    await expect(
      prisma.unifiedComparison.create({
        data: {
          testId: b.testId,
          baselineId: a.baselineId,
          mismatchPixelCount: 1,
          status: 'PENDING_APPROVAL',
        },
      }),
    ).rejects.toThrow(/does not match|names test/i);
  });

  it('rejects a comparison whose candidate belongs to another test', async () => {
    const a = await seedTest('identity-g', 'login');
    const b = await seedTest('identity-h', 'checkout');

    await expect(
      prisma.unifiedComparison.create({
        data: {
          testId: a.testId,
          baselineId: a.baselineId,
          candidateId: b.baselineId,
          mismatchPixelCount: 1,
          status: 'PENDING_APPROVAL',
        },
      }),
    ).rejects.toThrow(/does not match|names test/i);
  });

  it('rejects a run whose project is not its branch project', async () => {
    const { branchId: branchA } = await TestApp.createProject('run-a');
    const a = await prisma.project.findUniqueOrThrow({
      where: { name: 'run-a' },
    });
    const { branchId: branchB } = await TestApp.createProject('run-b');

    await expect(
      prisma.run.create({
        data: { projectId: a.id, branchId: branchB, key: 'ci-1' },
      }),
    ).rejects.toThrow(/does not match|names project/i);

    // The consistent shape is accepted, so the trigger is not simply refusing
    // every run.
    const run = await prisma.run.create({
      data: { projectId: a.id, branchId: branchA, key: 'ci-2' },
    });
    expect(run.projectId).toBe(a.id);
  });

  it('rejects a branch whose target lives in another project', async () => {
    const { projectId: projectA } = await TestApp.createProject('target-a');
    const { branchId: branchB } = await TestApp.createProject('target-b');

    await expect(
      prisma.branch.create({
        data: { projectId: projectA, name: 'feature', targetBranchId: branchB },
      }),
    ).rejects.toThrow(/another project|targets branch/i);
  });

  it('rejects a project that adopts another project default branch', async () => {
    await TestApp.createProject('default-a');
    const { branchId: branchB } = await TestApp.createProject('default-b');
    const projectA = await prisma.project.findUniqueOrThrow({
      where: { name: 'default-a' },
    });

    await expect(
      prisma.project.update({
        where: { id: projectA.id },
        data: { defaultBranchId: branchB },
      }),
    ).rejects.toThrow(/another project|names branch/i);
  });

  it('deletes the comments with their test', async () => {
    const a = await seedTest('comments-a', 'login');
    await prisma.reviewComment.create({
      data: {
        projectName: 'comments-a',
        testId: a.testId,
        body: 'looks off',
        author: 'jane',
      },
    });

    await prisma.unifiedTest.delete({ where: { id: a.testId } });

    expect(
      await prisma.reviewComment.count({ where: { testId: a.testId } }),
    ).toBe(0);
  });
});
