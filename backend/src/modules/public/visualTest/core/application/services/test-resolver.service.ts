import { Injectable } from '@nestjs/common';
import { DomainError } from '@common/domain/domain-error';
import { UnifiedTestRepository } from '@public/visualTest/core/infrastructure/repositories/unified-test.repository';
import { ProjectRepository } from '@public/visualTest/core/infrastructure/repositories/prisma-project.repository';
import type { TestKind } from '@common/domain/test-kind';

@Injectable()
export class TestResolver {
  constructor(
    private readonly tests: UnifiedTestRepository,
    private readonly projects: ProjectRepository,
  ) {}

  async findTest(
    projectName: string,
    testName: string,
  ): Promise<{ id: string; name: string; kind: TestKind }> {
    const test = await this.tests.findByProjectNameAndTestName(
      projectName,
      testName,
    );
    if (!test) {
      await this.resolveProject(projectName);
      throw new DomainError(`Test "${testName}" not found`, 'NOT_FOUND');
    }
    return { id: test.id, name: test.name, kind: test.kind };
  }

  // Single owner of the kind rule ("a command or read on test X of kind Y is
  // valid only when X.kind === Y"). findTestOfKind resolves the test and
  // asserts its kind for commands; assertTestKind is the non-querying twin for
  // read paths that already resolved the test through the read model. One
  // message per kind, one error code — a third kind adds one message here, not
  // another bespoke check in a caller.
  async findTestOfKind(
    projectName: string,
    testName: string,
    kind: TestKind,
  ): Promise<{ id: string; name: string; kind: TestKind }> {
    const test = await this.findTest(projectName, testName);
    this.assertTestKind(test, kind);
    return test;
  }

  assertTestKind(test: { name: string; kind: TestKind }, kind: TestKind): void {
    if (test.kind === kind) return;
    throw new DomainError(
      kind === 'image'
        ? `Test "${test.name}" is not an image test`
        : `Test "${test.name}" is not a PDF test`,
      'BAD_REQUEST',
    );
  }

  async resolveProject(projectName: string): Promise<{ id: string }> {
    const project = await this.projects.findByName(projectName);
    if (!project) {
      throw new DomainError(`Project "${projectName}" not found`, 'NOT_FOUND');
    }
    return project;
  }
}
