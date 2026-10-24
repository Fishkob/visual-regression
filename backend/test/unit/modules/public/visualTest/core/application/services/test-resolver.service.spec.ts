import type { Mocked } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { TestResolver } from '@public/visualTest/core/application/services/test-resolver.service';
import { DomainError } from '@common/domain/domain-error';
import { ProjectRepository } from '@public/visualTest/core/infrastructure/repositories/prisma-project.repository';
import { BranchResolver } from '@public/visualTest/core/application/services/branch-resolver.service';
import { BranchTestRepository } from '@public/visualTest/core/infrastructure/repositories/branch-test.repository';
import { createMock } from '@test/utils/create-mock';

describe('TestResolver', () => {
  let service: TestResolver;
  let projects: Mocked<ProjectRepository>;
  let branches: Mocked<BranchResolver>;
  let branchTests: Mocked<BranchTestRepository>;

  const branch = {
    projectId: 'proj-1',
    branchId: 'br-main',
    branchName: 'main',
    isDefault: true,
    isArchived: false,
  };

  function effectiveTest(overrides: Record<string, unknown> = {}) {
    return {
      id: 'test-1',
      name: 'my-test',
      kind: 'image' as const,
      status: 'PENDING' as const,
      createdAt: new Date(),
      origin: 'branch' as const,
      inheritedFrom: null,
      ...overrides,
    };
  }

  beforeEach(async () => {
    projects = createMock<ProjectRepository>();
    branches = createMock<BranchResolver>();
    branches.resolveRead.mockResolvedValue(branch);
    branchTests = createMock<BranchTestRepository>();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TestResolver,
        { provide: ProjectRepository, useValue: projects },
        { provide: BranchResolver, useValue: branches },
        { provide: BranchTestRepository, useValue: branchTests },
      ],
    }).compile();

    service = module.get<TestResolver>(TestResolver);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('findTest', () => {
    it('returns the effective test of the branch', async () => {
      branchTests.findEffectiveTest.mockResolvedValue(effectiveTest());

      const result = await service.findTest('my-project', 'my-test');

      expect(branches.resolveRead).toHaveBeenCalledWith(
        'my-project',
        undefined,
      );
      expect(branchTests.findEffectiveTest).toHaveBeenCalledWith(
        'br-main',
        'my-test',
      );
      expect(result).toEqual({
        id: 'test-1',
        name: 'my-test',
        kind: 'image',
        origin: 'branch',
        inheritedFrom: null,
      });
    });

    it('tags an inherited ancestor test as inherited', async () => {
      branchTests.findEffectiveTest.mockResolvedValue(
        effectiveTest({ origin: 'inherited', inheritedFrom: 'main' }),
      );

      const result = await service.findTest(
        'my-project',
        'my-test',
        'feature/x',
      );

      expect(result.origin).toBe('inherited');
      expect(result.inheritedFrom).toBe('main');
    });

    it('throws when project not found', async () => {
      branches.resolveRead.mockRejectedValue(
        new DomainError('Project "unknown" not found', 'NOT_FOUND'),
      );

      await expect(service.findTest('unknown', 'test')).rejects.toThrow(
        DomainError,
      );
    });

    it('throws when test not found', async () => {
      branchTests.findEffectiveTest.mockResolvedValue(null);

      await expect(service.findTest('my-project', 'unknown')).rejects.toThrow(
        DomainError,
      );
    });
  });

  describe('findOwnTest', () => {
    it('returns a branch-owned test', async () => {
      branchTests.findOwnTest.mockResolvedValue(effectiveTest());

      await expect(
        service.findOwnTest('my-project', 'my-test', 'feature/x'),
      ).resolves.toEqual({
        id: 'test-1',
        name: 'my-test',
        kind: 'image',
      });
      expect(branches.resolveRead).toHaveBeenCalledWith(
        'my-project',
        'feature/x',
      );
    });

    it('rejects mutating an inherited test with CONFLICT', async () => {
      branchTests.findOwnTest.mockResolvedValue(null);
      branchTests.findEffectiveTest.mockResolvedValue(
        effectiveTest({ origin: 'inherited', inheritedFrom: 'main' }),
      );

      await expect(
        service.findOwnTest('my-project', 'my-test', 'feature/x'),
      ).rejects.toMatchObject({ code: 'CONFLICT' });
    });

    it('reports NOT_FOUND for a name absent from the branch and its chain', async () => {
      branchTests.findOwnTest.mockResolvedValue(null);
      branchTests.findEffectiveTest.mockResolvedValue(null);

      await expect(
        service.findOwnTest('my-project', 'missing', 'feature/x'),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    });
  });

  describe('findTestOfKind', () => {
    it('returns the test when its kind matches', async () => {
      branchTests.findOwnTest.mockResolvedValue(effectiveTest({ kind: 'pdf' }));

      const result = await service.findTestOfKind(
        'my-project',
        'my-test',
        'pdf',
      );

      expect(result).toEqual({
        id: 'test-1',
        name: 'my-test',
        kind: 'pdf',
      });
    });

    it('throws BAD_REQUEST when the kind does not match', async () => {
      branchTests.findOwnTest.mockResolvedValue(effectiveTest());

      await expect(
        service.findTestOfKind('my-project', 'my-test', 'pdf'),
      ).rejects.toMatchObject({
        code: 'BAD_REQUEST',
        message: 'Test "my-test" is not a PDF test',
      });
    });
  });
});
