import type { Mocked } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { ReviewInboxService } from '@public/visualTest/review/application/review-inbox.service';
import { ReviewInboxRepository } from '@public/visualTest/review/infrastructure/repositories/review-inbox.repository';
import { createMock } from '@test/utils/create-mock';
import { PaginationDto } from '@common/dto/pagination.dto';

describe('ReviewInboxService', () => {
  let service: ReviewInboxService;
  let inbox: Mocked<ReviewInboxRepository>;

  beforeEach(async () => {
    inbox = createMock<ReviewInboxRepository>();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReviewInboxService,
        { provide: ReviewInboxRepository, useValue: inbox },
      ],
    }).compile();
    service = module.get(ReviewInboxService);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('maps the pending rows to review DTOs', async () => {
    inbox.findPending.mockResolvedValue({
      data: [
        {
          comparisonId: 'c1',
          projectName: 'checkout-ui',
          groupId: 'g1',
          groupName: 'Checkout',
          testName: 'login',
          kind: 'image',
          variant: {
            viewport: '1920x1080',
            browser: 'Chrome',
            environment: 'staging',
          },
          mismatchPixelCount: 12,
          mismatchPageCount: null,
          createdAt: new Date('2026-10-20T10:00:00Z'),
        },
      ],
      total: 1,
    });

    const result = await service.getPending(new PaginationDto());

    expect(result.data[0]).toMatchObject({
      comparisonId: 'c1',
      projectName: 'checkout-ui',
      groupName: 'Checkout',
      testName: 'login',
      mismatchPixelCount: 12,
    });
  });
});
