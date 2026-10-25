import type { Mocked } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { TestCommandService } from '@public/visualTest/review/application/test-command.service';
import { TestResolver } from '@public/visualTest/core/application/services/test-resolver.service';
import { TestDeletionService } from '@public/visualTest/core/application/services/test-deletion.service';
import { ThresholdUpdateService } from '@public/visualTest/core/application/services/threshold-update.service';
import { AppLoggerService } from '@common/logging/app-logger.service';
import { createMockLogger } from '@test/utils/mocks';
import { DomainError } from '@common/domain/domain-error';
import { createMock } from '@test/utils/create-mock';
describe('TestCommandService', () => {
  let service: TestCommandService;
  let screenshots: Mocked<ThresholdUpdateService>;
  let testResolver: Mocked<TestResolver>;
  let testDeletion: Mocked<TestDeletionService>;

  beforeEach(async () => {
    screenshots = createMock<ThresholdUpdateService>();
    testResolver = createMock<TestResolver>();
    testDeletion = createMock<TestDeletionService>();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TestCommandService,
        { provide: TestResolver, useValue: testResolver },
        { provide: TestDeletionService, useValue: testDeletion },
        { provide: ThresholdUpdateService, useValue: screenshots },
        { provide: AppLoggerService, useValue: createMockLogger() },
      ],
    }).compile();

    service = module.get<TestCommandService>(TestCommandService);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('updateThreshold', () => {
    beforeEach(() => {
      testResolver.findTestOfKind.mockResolvedValue({
        id: 'test-1',
        name: 'my-test',
        kind: 'image',
      });
      screenshots.update.mockResolvedValue({ autoAcceptedCount: 0 });
    });

    it('delegates to the threshold update owner with the resolved test id', async () => {
      const result = await service.updateThreshold('my-test', 'my-project', 20);

      expect(screenshots.update).toHaveBeenCalledWith(
        'test-1',
        'my-test',
        20,
        undefined,
        false,
      );
      expect(result).toMatchObject({
        test: 'my-test',
        status: 'updated',
        threshold: 20,
        autoAcceptedCount: 0,
      });
    });

    it('forwards the variant filters', async () => {
      await service.updateThreshold('my-test', 'my-project', 20, {
        viewport: '1920x1080',
      });

      expect(screenshots.update).toHaveBeenCalledWith(
        'test-1',
        'my-test',
        20,
        {
          viewport: '1920x1080',
        },
        false,
      );
    });

    it('forwards the preview flag', async () => {
      await service.updateThreshold('my-test', 'my-project', 20, {}, true);

      expect(screenshots.update).toHaveBeenCalledWith(
        'test-1',
        'my-test',
        20,
        {},
        true,
      );
    });

    it('rejects threshold updates for a PDF test because the value would be ignored', async () => {
      testResolver.findTestOfKind.mockRejectedValue(
        new DomainError('Test "my-test" is not an image test', 'BAD_REQUEST'),
      );

      await expect(
        service.updateThreshold('my-test', 'my-project', 20),
      ).rejects.toThrow(DomainError);

      expect(screenshots.update).not.toHaveBeenCalled();
    });

    it('rejects invalid variant filters before delegating', async () => {
      await expect(
        service.updateThreshold('my-test', 'my-project', 20, {
          viewport: '',
        }),
      ).rejects.toThrow(DomainError);

      expect(screenshots.update).not.toHaveBeenCalled();
    });
  });

  describe('deleteTest', () => {
    it('deletes entire test when no variant filters provided', async () => {
      testResolver.findOwnTest.mockResolvedValue({
        id: 'test-1',
        name: 'my-test',
        kind: 'image',
      });

      await service.deleteTest('my-project', 'my-test');

      expect(testDeletion.deleteTest).toHaveBeenCalledWith(
        'test-1',
        expect.objectContaining({
          projectName: 'my-project',
          testName: 'my-test',
        }),
      );
    });

    it('deletes variant screenshots when filters provided', async () => {
      testResolver.findOwnTest.mockResolvedValue({
        id: 'test-1',
        name: 'my-test',
        kind: 'image',
      });
      testDeletion.deleteScreenshotsByFilters.mockResolvedValue(['ss-1']);

      const result = await service.deleteTest(
        'my-project',
        'my-test',
        undefined,
        {
          viewport: '1920x1080',
        },
      );

      expect(testDeletion.deleteScreenshotsByFilters).toHaveBeenCalledWith(
        'test-1',
        {
          viewport: '1920x1080',
        },
        expect.objectContaining({
          projectName: 'my-project',
          testName: 'my-test',
        }),
      );
      expect(result).toEqual({ success: true, scope: 'variant' });
    });

    it('throws when no screenshots match variant filter', async () => {
      testResolver.findOwnTest.mockResolvedValue({
        id: 'test-1',
        name: 'my-test',
        kind: 'image',
      });
      testDeletion.deleteScreenshotsByFilters.mockResolvedValue([]);

      await expect(
        service.deleteTest('my-project', 'my-test', undefined, {
          viewport: '800x600',
        }),
      ).rejects.toThrow(DomainError);
    });

    it('rejects deleting an inherited test from a feature branch', async () => {
      testResolver.findOwnTest.mockRejectedValue(
        new DomainError(
          'Test "login" is inherited from branch "main" and cannot be modified here',
          'CONFLICT',
        ),
      );

      await expect(
        service.deleteTest('app', 'login', 'feature/x'),
      ).rejects.toMatchObject({ code: 'CONFLICT' });
    });

    it('does not delete the whole test when a filter value is an empty string', async () => {
      testResolver.findOwnTest.mockResolvedValue({
        id: 'test-1',
        name: 'my-test',
        kind: 'image',
      });

      await expect(
        service.deleteTest('my-project', 'my-test', undefined, {
          viewport: '',
        }),
      ).rejects.toThrow(DomainError);

      expect(testDeletion.deleteTest).not.toHaveBeenCalled();
      expect(testDeletion.deleteScreenshotsByFilters).not.toHaveBeenCalled();
    });
  });
});
