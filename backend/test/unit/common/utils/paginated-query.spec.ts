import { describe, expect, it } from 'vitest';
import { paginatedQuery } from '@common/utils/paginated-query';
import { createPaginatedResponse } from '@common/dto/paginated-response.dto';

vi.mock('@common/dto/paginated-response.dto', () => ({
  createPaginatedResponse: vi.fn((data, page, limit, total) => ({
    data,
    meta: {
      page,
      limit,
      total,
      totalPages: 1,
      hasNextPage: false,
      hasPreviousPage: false,
    },
  })),
}));

describe('paginatedQuery', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  const mockQuery = vi.fn().mockResolvedValue({
    data: [{ name: 'test1' }],
    total: 1,
  });

  it('uses provided page and limit from pagination object', async () => {
    const result = await paginatedQuery(mockQuery, {
      page: 3,
      limit: 10,
      skip: 20,
      take: 10,
    });

    expect(result.meta.page).toBe(3);
    expect(result.meta.limit).toBe(10);
  });

  it('defaults page to 1 when not provided', async () => {
    const result = await paginatedQuery(mockQuery, { skip: 0, take: 20 });

    expect(result.meta.page).toBe(1);
    expect(result.meta.limit).toBe(20);
  });

  it('defaults limit to 20 when not provided', async () => {
    const result = await paginatedQuery(mockQuery, {
      skip: 0,
      take: 20,
      page: 2,
    });

    expect(result.meta.page).toBe(2);
    expect(result.meta.limit).toBe(20);
  });

  it('uses the effective page size (take) for meta when limit is absent', async () => {
    const result = await paginatedQuery(mockQuery, {
      skip: 0,
      take: 5,
    });

    expect(result.meta.limit).toBe(5);
  });

  it('passes the effective page size to the response builder', async () => {
    const many = vi.fn().mockResolvedValue({
      data: [{ name: 't0' }],
      total: 12,
    });
    await paginatedQuery(many, { skip: 0, take: 5 });

    expect(createPaginatedResponse).toHaveBeenCalledWith(
      [{ name: 't0' }],
      1,
      5,
      12,
    );
  });

  it('applies mapper when provided', async () => {
    const result = await paginatedQuery(
      mockQuery,
      { skip: 0, take: 20 },
      (r: { name: string }) => ({ name: r.name.toUpperCase() }),
    );

    expect(result.data).toEqual([{ name: 'TEST1' }]);
  });

  it('returns raw data when no mapper', async () => {
    const result = await paginatedQuery(mockQuery, { skip: 0, take: 20 });

    expect(result.data).toEqual([{ name: 'test1' }]);
  });
});
