import { Injectable } from '@nestjs/common';
import { BaseRepository } from '@/prisma/base.repository';
import { DomainError } from '@common/domain/domain-error';
import { TestKind, TestStatus } from '@/prisma/client';

@Injectable()
export class UnifiedTestRepository extends BaseRepository {
  // A test belongs to exactly one branch; the project is reached through it.
  // This is the cross-branch seam project deletion uses to collect every test
  // of a project without materializing branch by branch.
  async findIdsByProjectId(projectId: string): Promise<string[]> {
    const tests = await this.client.unifiedTest.findMany({
      where: { branch: { projectId } },
      select: { id: true },
    });
    return tests.map((t) => t.id);
  }

  async findIdsByBranchId(branchId: string): Promise<string[]> {
    const tests = await this.client.unifiedTest.findMany({
      where: { branchId },
      select: { id: true },
    });
    return tests.map((test) => test.id);
  }

  async updateStatus(testId: string, status: TestStatus) {
    this.assertWritable();
    await this.client.unifiedTest.update({
      where: { id: testId },
      data: { status },
    });
  }

  async findMetadata(testId: string) {
    return this.client.unifiedTest.findUnique({
      where: { id: testId },
      select: {
        id: true,
        name: true,
        description: true,
        tags: true,
        mutedUntil: true,
        muteReason: true,
      },
    });
  }

  async updateMetadata(
    testId: string,
    data: {
      name?: string;
      description?: string | null;
      tags?: string[];
      mutedUntil?: Date | null;
      muteReason?: string | null;
    },
  ) {
    // Metadata does not change test status, so it is a standalone write (the
    // same carve-out ProjectRepository uses) and never needs a workflow.
    return this.client.unifiedTest.update({
      where: { id: testId },
      data,
      select: {
        id: true,
        name: true,
        description: true,
        tags: true,
        mutedUntil: true,
        muteReason: true,
      },
    });
  }

  async deleteByIds(testIds: string[]) {
    this.assertWritable();
    if (testIds.length === 0) return;
    await this.client.unifiedTest.deleteMany({
      where: { id: { in: testIds } },
    });
  }

  async findByBranchAndTestName(
    branchId: string,
    testName: string,
  ): Promise<{
    id: string;
    name: string;
    kind: TestKind;
    createdAt: Date;
  } | null> {
    return this.client.unifiedTest.findFirst({
      where: { name: testName, branchId },
      select: { id: true, name: true, kind: true, createdAt: true },
    });
  }

  async ensureTest(
    branchId: string,
    testName: string,
    kind: TestKind,
  ): Promise<{ testId: string }> {
    this.assertWritable();
    const test = await this.client.unifiedTest.upsert({
      where: { branchId_name: { branchId, name: testName } },
      create: { branchId, name: testName, kind },
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
