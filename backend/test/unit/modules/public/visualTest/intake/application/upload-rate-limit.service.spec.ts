import { Test, TestingModule } from '@nestjs/testing';
import type { Mocked } from 'vitest';
import { PrismaConnection } from '@/prisma/prisma-connection';
import { UploadRateLimitService } from '@public/visualTest/intake/application/upload-rate-limit.service';
import { createMock } from '@test/utils/create-mock';

describe('UploadRateLimitService', () => {
  let service: UploadRateLimitService;
  let mockConnection: Mocked<PrismaConnection>;
  let mockClient: { $queryRaw: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    mockClient = { $queryRaw: vi.fn() };
    mockConnection = createMock<PrismaConnection>();
    Object.defineProperty(mockConnection, 'client', { get: () => mockClient });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UploadRateLimitService,
        { provide: PrismaConnection, useValue: mockConnection },
      ],
    }).compile();

    service = module.get(UploadRateLimitService);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('runs the atomic upsert and reports allowed under the limit', async () => {
    mockClient.$queryRaw.mockResolvedValue([{ count: 5 }]);

    const result = await service.tryConsume(
      'k1',
      new Date('2026-08-24T10:15:00.000Z'),
      60,
    );

    expect(result).toEqual({ allowed: true, count: 5 });
    expect(mockClient.$queryRaw).toHaveBeenCalledWith(
      expect.anything(),
      expect.any(String),
      'k1',
      new Date('2026-08-24T10:15:00.000Z'),
    );
  });

  it('reports rejected at the limit boundary (count > limit)', async () => {
    mockClient.$queryRaw.mockResolvedValue([{ count: 61 }]);

    const result = await service.tryConsume(
      'k1',
      new Date('2026-08-24T10:15:00.000Z'),
      60,
    );

    expect(result).toEqual({ allowed: false, count: 61 });
  });

  it('treats an empty result as a zero count', async () => {
    mockClient.$queryRaw.mockResolvedValue([]);

    const result = await service.tryConsume(
      'k1',
      new Date('2026-08-24T10:15:00.000Z'),
      60,
    );

    expect(result).toEqual({ allowed: true, count: 0 });
  });
});
