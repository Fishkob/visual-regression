import type { Mock, Mocked } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { UploadController } from '@public/visualTest/intake/presentation/controllers/upload.controller';
import { UploadIntake } from '@public/visualTest/intake/application/upload-intake.service';
import { FileValidationPipe } from '@common/http/pipes/file-validation.pipe';
import { AppConfigService } from '@config/app-config.service';
import {
  BaselineCreatedResultDto,
  ComparisonQueuedResultDto,
  IdenticalResultDto,
} from '@public/visualTest/intake/presentation/dto/upload.dto';
import { AppLoggerService } from '@common/logging/app-logger.service';
import {
  METRICS_RECORDER,
  IMetricsRecorder,
} from '@common/domain/metrics-recorder.interface';
import { UploadRateLimitService } from '@public/visualTest/intake/application/upload-rate-limit.service';
import { createMock } from '@test/utils/create-mock';
import { createMockFile, createMockLogger } from '@test/utils/mocks';

describe('UploadController', () => {
  let controller: UploadController;
  let uploadIntake: Mocked<{ upload: Mock }>;

  const projectName = 'my-project';
  const testName = 'my-test';
  const body = {
    viewport: '1920x1080',
    browser: 'Chrome',
    environment: 'staging',
  };

  beforeEach(async () => {
    uploadIntake = { upload: vi.fn() } as any;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [UploadController],
      providers: [
        { provide: UploadIntake, useValue: uploadIntake },
        {
          provide: AppConfigService,
          useValue: { screenshotMaxSize: 5 * 1024 * 1024 },
        },
        FileValidationPipe,
        { provide: AppLoggerService, useValue: createMockLogger() },
        {
          provide: UploadRateLimitService,
          useValue: createMock<UploadRateLimitService>(),
        },
        {
          provide: METRICS_RECORDER,
          useValue: createMock<IMetricsRecorder>(),
        },
      ],
    }).compile();

    controller = module.get(UploadController);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('upload', () => {
    const mockFile = createMockFile({ size: 1000 });

    it('returns BaselineCreatedResultDto for image baseline creation', async () => {
      uploadIntake.upload.mockResolvedValue({
        status: 'baseline_created',
        testId: 'test-1',
        fileUrl: 'http://storage/file.png',
      });

      const result = await controller.upload(
        projectName,
        testName,
        'image',
        mockFile,
        body,
      );

      expect(result).toBeInstanceOf(BaselineCreatedResultDto);
      expect(result).toMatchObject({
        status: 'baseline_created',
        testId: 'test-1',
        fileUrl: 'http://storage/file.png',
      });
    });

    it('returns IdenticalResultDto for identical image upload', async () => {
      uploadIntake.upload.mockResolvedValue({
        status: 'identical',
        mismatchPixelCount: 0,
      });

      const result = await controller.upload(
        projectName,
        testName,
        'image',
        mockFile,
        body,
      );

      expect(result).toBeInstanceOf(IdenticalResultDto);
      expect(result).toMatchObject({
        status: 'identical',
        mismatchPixelCount: 0,
      });
    });

    it('returns ComparisonQueuedResultDto for image comparison queued', async () => {
      uploadIntake.upload.mockResolvedValue({
        status: 'comparison_queued',
        error: 'image_difference',
        message: 'Differences found',
      });

      const result = await controller.upload(
        projectName,
        testName,
        'image',
        mockFile,
        body,
      );

      expect(result).toBeInstanceOf(ComparisonQueuedResultDto);
      expect(result).toMatchObject({
        status: 'comparison_queued',
        error: 'image_difference',
        message: 'Differences found',
      });
    });

    it('returns BaselineCreatedResultDto for PDF baseline creation', async () => {
      uploadIntake.upload.mockResolvedValue({
        status: 'baseline_created',
        testId: 'test-2',
        fileUrl: 'http://storage/file.pdf',
      });

      const result = await controller.upload(
        projectName,
        testName,
        'pdf',
        mockFile,
        body,
      );

      expect(result).toBeInstanceOf(BaselineCreatedResultDto);
      expect(result).toMatchObject({
        status: 'baseline_created',
        testId: 'test-2',
        fileUrl: 'http://storage/file.pdf',
      });
    });

    it('forwards the testKind to the upload intake', async () => {
      uploadIntake.upload.mockResolvedValue({
        status: 'comparison_queued',
        error: 'pdf_difference',
        message: 'PDF pages differ',
      });

      await controller.upload(projectName, testName, 'pdf', mockFile, body);

      expect(uploadIntake.upload).toHaveBeenCalledWith(
        expect.anything(),
        'pdf',
      );
    });

    it('does not forward a threshold from body to the upload intake', async () => {
      const bodyWithThreshold = { ...body, threshold: 0.5 };
      uploadIntake.upload.mockResolvedValue({
        status: 'identical',
        mismatchPixelCount: 0,
      });

      await controller.upload(
        projectName,
        testName,
        'image',
        mockFile,
        bodyWithThreshold,
      );

      expect(uploadIntake.upload).toHaveBeenCalledWith(
        expect.not.objectContaining({ threshold: expect.anything() }),
        'image',
      );
    });

    it('passes all parameters to the upload intake', async () => {
      uploadIntake.upload.mockResolvedValue({
        status: 'identical',
        mismatchPixelCount: 0,
      });

      await controller.upload(projectName, testName, 'image', mockFile, body);

      expect(uploadIntake.upload).toHaveBeenCalledWith(
        {
          projectName,
          testName,
          viewport: body.viewport,
          browser: body.browser,
          environment: body.environment,
          file: mockFile,
        },
        'image',
      );
    });
  });
});
