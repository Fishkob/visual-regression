import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { PaginationDto } from '@common/dto/pagination.dto';

describe('PaginationDto', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function transform(
    query: Record<string, unknown>,
  ): Promise<PaginationDto> {
    const dto = plainToInstance(PaginationDto, query);
    const errors = await validate(dto, { whitelist: true });
    expect(errors).toEqual([]);
    return dto;
  }

  it('honors skip/take sent by the SDK and frontend', async () => {
    const dto = await transform({ skip: 0, take: 100 });

    expect(dto.skip).toBe(0);
    expect(dto.take).toBe(100);
  });

  it('resolves skip/take from page/limit for legacy clients', async () => {
    const dto = await transform({ page: 2, limit: 25 });

    expect(dto.skip).toBe(25);
    expect(dto.take).toBe(25);
  });

  it('derives skip from the effective page size when page+take is sent without limit', async () => {
    const dto = await transform({ page: 3, take: 25 });

    expect(dto.skip).toBe(50);
    expect(dto.take).toBe(25);
  });

  it('prefers explicit skip/take when both styles are sent', async () => {
    const dto = await transform({ page: 2, limit: 25, skip: 0, take: 100 });

    expect(dto.skip).toBe(0);
    expect(dto.take).toBe(100);
  });

  it('defaults to the first page of 20 when nothing is sent', async () => {
    const dto = await transform({});

    expect(dto.skip).toBe(0);
    expect(dto.take).toBe(20);
  });

  it('rejects a negative skip', async () => {
    const dto = plainToInstance(PaginationDto, { skip: -1 });
    const errors = await validate(dto, { whitelist: true });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects a limit above the documented maximum of 100', async () => {
    const dto = plainToInstance(PaginationDto, { limit: 1000 });
    const errors = await validate(dto, { whitelist: true });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects a take above the documented maximum of 100', async () => {
    const dto = plainToInstance(PaginationDto, { take: 1000 });
    const errors = await validate(dto, { whitelist: true });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('allows the maximum of 100', async () => {
    const dto = await transform({ take: 100 });
    expect(dto.take).toBe(100);
  });
});
