import { Injectable } from '@nestjs/common';
import { DomainError } from '@common/domain/domain-error';
import { BranchResolver } from '@public/visualTest/core/application/services/branch-resolver.service';
import { BranchTestRepository } from '@public/visualTest/core/infrastructure/repositories/branch-test.repository';
import type { TestKind } from '@common/domain/test-kind';

@Injectable()
export class TestResolver {
  constructor(
    private readonly branches: BranchResolver,
    private readonly branchTests: BranchTestRepository,
  ) {}

  // Resolves the effective test of a branch: a materialized branch test, or the
  // nearest ancestor's test it inherits. The origin tells the caller whether
  // mutations are allowed (an inherited test is read-only in this branch).
  async findTest(
    projectName: string,
    testName: string,
    branchName?: string,
  ): Promise<{
    id: string;
    name: string;
    kind: TestKind;
    origin: 'branch' | 'inherited';
    inheritedFrom: string | null;
  }> {
    const branch = await this.branches.resolveRead(projectName, branchName);
    const test = await this.branchTests.findEffectiveTest(
      branch.branchId,
      testName,
    );
    if (!test) {
      throw new DomainError(`Test "${testName}" not found`, 'NOT_FOUND');
    }
    return {
      id: test.id,
      name: test.name,
      kind: test.kind,
      origin: test.origin,
      inheritedFrom: test.inheritedFrom,
    };
  }

  // Resolves a test the branch owns — the mutation precondition. An inherited
  // test is a CONFLICT (its review belongs to the ancestor branch), a name that
  // exists nowhere is NOT_FOUND.
  async findOwnTest(
    projectName: string,
    testName: string,
    branchName?: string,
  ): Promise<{ id: string; name: string; kind: TestKind }> {
    const branch = await this.branches.resolveRead(projectName, branchName);
    const test = await this.branchTests.findOwnTest(branch.branchId, testName);
    if (!test) {
      const inherited = await this.branchTests.findEffectiveTest(
        branch.branchId,
        testName,
      );
      if (inherited) {
        throw new DomainError(
          `Test "${testName}" is inherited from branch "${inherited.inheritedFrom}" and cannot be modified here`,
          'CONFLICT',
        );
      }
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
    branchName?: string,
  ): Promise<{ id: string; name: string; kind: TestKind }> {
    const test = await this.findOwnTest(projectName, testName, branchName);
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
}
