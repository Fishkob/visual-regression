import { Test, TestingModule } from '@nestjs/testing';
import type { Mocked } from 'vitest';
import { PrismaConnection } from '@/prisma/prisma-connection';
import { RateLimitService } from '@internal/rate-limit/rate-limit.service';
import { createMock } from '@test/utils/create-mock';

describe('RateLimitService', () => {
  let service: RateLimitService;
  let mockConnection: Mocked<PrismaConnection>;
  let mockClient: { $queryRaw: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    mockClient = { $queryRaw: vi.fn() };
    mockConnection = createMock<PrismaConnection>();
    Object.defineProperty(mockConnection, 'client', { get: () => mockClient });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RateLimitService,
        { provide: PrismaConnection, useValue: mockConnection },
      ],
    }).compile();

    service = module.get(RateLimitService);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('runs the atomic upsert and reports allowed under the limit', async () => {
    mockClient.$queryRaw.mockResolvedValue([{ count: 5 }]);

    const result = await service.tryConsume('upload', 'apikey:k1', 60);

    expect(result).toEqual({ allowed: true, count: 5 });
    expect(mockClient.$queryRaw).toHaveBeenCalledWith(
      expect.anything(),
      expect.any(String),
      'upload',
      'apikey:k1',
      expect.any(Date),
    );
  });

  it('reports rejected at the limit boundary (count > limit)', async () => {
    mockClient.$queryRaw.mockResolvedValue([{ count: 61 }]);

    const result = await service.tryConsume('upload', 'apikey:k1', 60);

    expect(result).toEqual({ allowed: false, count: 61 });
  });

  it('treats an empty result as a zero count', async () => {
    mockClient.$queryRaw.mockResolvedValue([]);

    const result = await service.tryConsume('login', 'ip:203.0.113.9', 5);

    expect(result).toEqual({ allowed: true, count: 0 });
  });
});
