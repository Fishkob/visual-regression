import { Test, TestingModule } from '@nestjs/testing';
import type { Mocked } from 'vitest';
import { PrismaConnection } from '@/prisma/prisma-connection';
import { RateLimitService } from '@internal/rate-limit/rate-limit.service';
import { RATE_LIMIT_WINDOW_MS } from '@internal/rate-limit/rate-limit-window';
import { createMock } from '@test/utils/create-mock';

describe('RateLimitService', () => {
  let service: RateLimitService;
  let mockConnection: Mocked<PrismaConnection>;
  let mockClient: { $queryRaw: ReturnType<typeof vi.fn> };

  // Half way through the minute that starts at 2026-01-01T00:00:00Z, i.e. the
  // previous window still overlaps the rolling minute with 50 % of its budget.
  const halfWay = Date.UTC(2026, 0, 1, 0, 0, RATE_LIMIT_WINDOW_MS / 2000);

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
    mockClient.$queryRaw.mockResolvedValue([{ count: 5, previousCount: null }]);

    const result = await service.tryConsume('upload', 'apikey:k1', 60);

    expect(result).toEqual({ allowed: true, count: 5 });
    const [, ...values] = mockClient.$queryRaw.mock.calls[0] as unknown[];
    expect(values).toContain('upload');
    expect(values).toContain('apikey:k1');
    expect(values.some((value) => value instanceof Date)).toBe(true);
  });

  it('reports rejected at the limit boundary (count > limit)', async () => {
    mockClient.$queryRaw.mockResolvedValue([
      { count: 61, previousCount: null },
    ]);

    const result = await service.tryConsume('upload', 'apikey:k1', 60);

    expect(result).toEqual({ allowed: false, count: 61 });
  });

  it('treats an empty result as a zero count', async () => {
    mockClient.$queryRaw.mockResolvedValue([]);

    const result = await service.tryConsume('login', 'ip:203.0.113.9', 5);

    expect(result).toEqual({ allowed: true, count: 0 });
  });

  it('counts the previous window at its full weight at the boundary', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(
      Date.UTC(2026, 0, 1, 0, 1, 0) + 1, // one millisecond into the new minute
    );
    mockClient.$queryRaw.mockResolvedValue([{ count: 1, previousCount: 20 }]);

    const result = await service.tryConsume('login', 'ip:203.0.113.9', 10);

    expect(result).toEqual({ allowed: false, count: 1 });
  });

  it('decays the previous window while the rolling minute advances', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(halfWay);
    mockClient.$queryRaw.mockResolvedValue([{ count: 6, previousCount: 10 }]);

    const result = await service.tryConsume('login', 'ip:203.0.113.9', 10);

    // 6 + ceil(10 * 0.5) = 11 > 10.
    expect(result).toEqual({ allowed: false, count: 6 });
  });

  it('allows a request that fits once the previous window has decayed', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(halfWay);
    mockClient.$queryRaw.mockResolvedValue([{ count: 5, previousCount: 10 }]);

    const result = await service.tryConsume('login', 'ip:203.0.113.9', 10);

    // 5 + ceil(10 * 0.5) = 10 <= 10.
    expect(result).toEqual({ allowed: true, count: 5 });
  });
});
