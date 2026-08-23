import { Test, TestingModule } from '@nestjs/testing';
import { DlqController } from '@/modules/internal/dlq/dlq.controller';
import { DlqService } from '@/modules/internal/dlq/dlq.service';
import { AdminAuthGuard } from '@/modules/internal/dlq/admin-auth.guard';
import { AppConfigService } from '@config/app-config.service';
import { createMock } from '@test/utils/create-mock';

describe('DlqController', () => {
  let controller: DlqController;
  let dlqService: jest.Mocked<DlqService>;

  beforeEach(async () => {
    dlqService = createMock<DlqService>();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [DlqController],
      providers: [
        { provide: DlqService, useValue: dlqService },
        AdminAuthGuard,
        { provide: AppConfigService, useValue: { admin: { apiKey: 'k' } } },
      ],
    }).compile();

    controller = module.get(DlqController);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('listFailedJobs', () => {
    it('returns failed jobs list', async () => {
      const mockJobs = [{ id: 'job-1', testId: 'test-1', testKind: 'image' }];
      dlqService.listFailedJobs.mockResolvedValue(mockJobs as any);

      const result = await controller.listFailedJobs();

      expect(result).toEqual({ data: mockJobs });
      expect(dlqService.listFailedJobs).toHaveBeenCalled();
    });

    it('returns empty list when no failed jobs', async () => {
      dlqService.listFailedJobs.mockResolvedValue([]);

      const result = await controller.listFailedJobs();

      expect(result).toEqual({ data: [] });
    });
  });

  describe('retryJob', () => {
    it('returns void on success', async () => {
      dlqService.retryJob.mockResolvedValue(undefined);

      await controller.retryJob('job-1');

      expect(dlqService.retryJob).toHaveBeenCalledWith('job-1');
    });
  });
});
