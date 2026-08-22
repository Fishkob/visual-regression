import { Injectable } from '@nestjs/common';
import { BaseRepository } from '@/prisma/base.repository';
import { DomainError } from '@common/domain/domain-error';
import { TestKind, TestStatus } from '@/prisma/client';
import { ProjectRepository } from '@public/visualTest/core/infrastructure/repositories/prisma-project.repository';
import { TransactionContext } from '@/prisma/transaction-context';

@Injectable()
export class UnifiedTestRepository extends BaseRepository {
  constructor(
    txCtx: TransactionContext,
    private readonly projects: ProjectRepository,
  ) {
    super(txCtx);
  }
  // Single owner of the "project + test by name" lookup: one query resolves
  // both facts, so read-model lookups (TestReadRepository) and the resolver
  // paths (TestResolver.findTest/findTestOrNull) cannot drift in what "does
  // this test exist" means. Returns null when the project or the test is
  // missing.
  async findByProjectNameAndTestName(
    projectName: string,
    testName: string,
  ): Promise<{
    id: string;
    name: string;
    kind: TestKind;
    createdAt: Date;
  } | null> {
    return this.client.unifiedTest.findFirst({
      where: { name: testName, project: { name: projectName } },
      select: { id: true, name: true, kind: true, createdAt: true },
    });
  }

  async findIdsByProjectId(projectId: string): Promise<string[]> {
    const tests = await this.client.unifiedTest.findMany({
      where: { projectId },
      select: { id: true },
    });
    return tests.map((t) => t.id);
  }

  async updateStatus(testId: string, status: TestStatus) {
    this.assertWritable();
    await this.client.unifiedTest.update({
      where: { id: testId },
      data: { status },
    });
  }

  async deleteByIds(testIds: string[]) {
    this.assertWritable();
    if (testIds.length === 0) return;
    await this.client.unifiedTest.deleteMany({
      where: { id: { in: testIds } },
    });
  }

  async ensureTest(
    projectName: string,
    testName: string,
    kind: TestKind,
  ): Promise<{ testId: string }> {
    this.assertWritable();
    const project = await this.projects.getOrCreate(projectName);

    const test = await this.client.unifiedTest.upsert({
      where: { projectId_name: { projectId: project.id, name: testName } },
      create: { projectId: project.id, name: testName, kind },
      update: {},
    });

    if (test.kind !== kind) {
      throw new DomainError(
        `Test "${testName}" already exists as a ${test.kind} test and cannot be uploaded as a ${kind} test`,
        'CONFLICT',
      );
    }

    return { testId: test.id };
  }
}
