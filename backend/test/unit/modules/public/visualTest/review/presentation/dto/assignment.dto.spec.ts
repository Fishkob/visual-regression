import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { AssignmentListQueryDto } from '@public/visualTest/review/presentation/dto/assignment.dto';

describe('AssignmentListQueryDto', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function parse(query: Record<string, unknown>) {
    const dto = plainToInstance(AssignmentListQueryDto, query);
    const errors = await validate(dto, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });
    return { dto, errors };
  }

  it('parses the query-string "true" into a boolean', async () => {
    const { dto, errors } = await parse({ includeCompleted: 'true' });

    expect(errors).toEqual([]);
    expect(dto.includeCompleted).toBe(true);
  });

  it('parses the query-string "false" into a boolean', async () => {
    const { dto, errors } = await parse({ includeCompleted: 'false' });

    expect(errors).toEqual([]);
    expect(dto.includeCompleted).toBe(false);
  });

  it('leaves an omitted includeCompleted undefined', async () => {
    const { dto, errors } = await parse({});

    expect(errors).toEqual([]);
    expect(dto.includeCompleted).toBeUndefined();
  });

  it('still accepts an already-boolean value', async () => {
    const { dto, errors } = await parse({ includeCompleted: true });

    expect(errors).toEqual([]);
    expect(dto.includeCompleted).toBe(true);
  });

  it('rejects a value that is neither "true" nor "false"', async () => {
    const { errors } = await parse({ includeCompleted: 'yes' });

    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('includeCompleted');
  });
});
