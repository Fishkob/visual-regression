import { BadRequestException } from '@nestjs/common';
import type { ArgumentMetadata } from '@nestjs/common';
import { IsString } from 'class-validator';
import { createValidationPipe } from '@common/http/validation-pipe';
import {
  TestNamesQueryDto,
  UpdateThresholdQueryDto,
} from '@public/visualTest/review/presentation/dto/project.dto';

class SampleDto {
  @IsString()
  name!: string;
}

const BODY: ArgumentMetadata = { type: 'body', metatype: SampleDto };
const QUERY: ArgumentMetadata = { type: 'query', metatype: SampleDto };
const TEST_NAMES_QUERY: ArgumentMetadata = {
  type: 'query',
  metatype: TestNamesQueryDto,
};
const UPDATE_THRESHOLD_QUERY: ArgumentMetadata = {
  type: 'query',
  metatype: UpdateThresholdQueryDto,
};

describe('createValidationPipe', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('accepts a payload that only carries known properties', async () => {
    const pipe = createValidationPipe();
    await expect(pipe.transform({ name: 'checkout' }, BODY)).resolves.toEqual({
      name: 'checkout',
    });
  });

  it('rejects a body carrying an unknown property', async () => {
    const pipe = createValidationPipe();
    await expect(
      pipe.transform({ name: 'checkout', extra: 1 }, BODY),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('names the offending property in the rejection', async () => {
    const pipe = createValidationPipe();
    const err = await pipe
      .transform({ name: 'checkout', extra: 1 }, BODY)
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(BadRequestException);
    expect((err as BadRequestException).getResponse()).toMatchObject({
      message: expect.arrayContaining([expect.stringContaining('extra')]),
    });
  });

  it('rejects a query carrying an unknown property', async () => {
    const pipe = createValidationPipe();
    await expect(
      pipe.transform({ name: 'checkout', surprise: true }, QUERY),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('accepts the kind filter alongside pagination', async () => {
    const pipe = createValidationPipe();
    await expect(
      pipe.transform({ page: 1, limit: 20, kind: 'image' }, TEST_NAMES_QUERY),
    ).resolves.toMatchObject({ kind: 'image' });
  });

  it('accepts the preview flag alongside variant filters', async () => {
    const pipe = createValidationPipe();
    await expect(
      pipe.transform(
        { viewport: '1920x1080', preview: 'true' },
        UPDATE_THRESHOLD_QUERY,
      ),
    ).resolves.toMatchObject({ preview: 'true' });
  });

  it('still rejects a genuinely unknown query property on the filter DTOs', async () => {
    const pipe = createValidationPipe();
    await expect(
      pipe.transform({ kind: 'image', bogus: 1 }, TEST_NAMES_QUERY),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
