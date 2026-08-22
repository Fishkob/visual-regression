import { Test, TestingModule } from '@nestjs/testing';
import { TestResolver } from '@public/visualTest/core/application/services/test-resolver.service';
import { DomainError } from '@common/domain/domain-error';
import { ProjectRepository } from '@public/visualTest/core/infrastructure/repositories/prisma-project.repository';
import { UnifiedTestRepository } from '@public/visualTest/core/infrastructure/repositories/unified-test.repository';
import { createMock } from '@test/utils/create-mock';
describe('TestResolver', () => {
  let service: TestResolver;
  let tests: jest.Mocked<UnifiedTestRepository>;
  let projects: jest.Mocked<ProjectRepository>;

  beforeEach(async () => {
    tests = createMock<UnifiedTestRepository>();
    projects = createMock<ProjectRepository>();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TestResolver,
        { provide: UnifiedTestRepository, useValue: tests },
        { provide: ProjectRepository, useValue: projects },
      ],
    }).compile();

    service = module.get<TestResolver>(TestResolver);
  });

  describe('findTest', () => {
    it('returns test when found', async () => {
      tests.findByProjectNameAndTestName.mockResolvedValue({
        id: 'test-1',
        name: 'my-test',
        kind: 'image',
        createdAt: new Date(),
      });

      const result = await service.findTest('my-project', 'my-test');

      expect(tests.findByProjectNameAndTestName).toHaveBeenCalledWith(
        'my-project',
        'my-test',
      );
      expect(result).toEqual({
        id: 'test-1',
        name: 'my-test',
        kind: 'image',
      });
    });

    it('throws when project not found', async () => {
      tests.findByProjectNameAndTestName.mockResolvedValue(null);
      projects.findByName.mockResolvedValue(null);

      await expect(service.findTest('unknown', 'test')).rejects.toThrow(
        DomainError,
      );
    });

    it('throws when test not found', async () => {
      tests.findByProjectNameAndTestName.mockResolvedValue(null);
      projects.findByName.mockResolvedValue({
        id: 'proj-1',
        name: 'my-project',
        createdAt: new Date(),
      });

      await expect(service.findTest('my-project', 'unknown')).rejects.toThrow(
        DomainError,
      );
    });
  });

  describe('findTestOfKind', () => {
    it('returns the test when its kind matches', async () => {
      tests.findByProjectNameAndTestName.mockResolvedValue({
        id: 'test-1',
        name: 'my-test',
        kind: 'pdf',
        createdAt: new Date(),
      });

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
      tests.findByProjectNameAndTestName.mockResolvedValue({
        id: 'test-1',
        name: 'my-test',
        kind: 'image',
        createdAt: new Date(),
      });

      await expect(
        service.findTestOfKind('my-project', 'my-test', 'pdf'),
      ).rejects.toMatchObject({
        code: 'BAD_REQUEST',
        message: 'Test "my-test" is not a PDF test',
      });
    });
  });
});
