import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateRetentionDto } from '@public/visualTest/review/presentation/dto/storage.dto';

describe('UpdateRetentionDto storage quota validation', () => {
  async function validateQuota(value: unknown) {
    const dto = plainToInstance(UpdateRetentionDto, {
      storageQuotaBytes: value,
    });
    return validate(dto);
  }

  it('accepts a positive whole number of bytes', async () => {
    await expect(validateQuota('10737418240')).resolves.toEqual([]);
  });

  it('accepts null as "unlimited"', async () => {
    await expect(validateQuota(null)).resolves.toEqual([]);
  });

  it('accepts an omitted quota', async () => {
    await expect(
      validate(plainToInstance(UpdateRetentionDto, {})),
    ).resolves.toEqual([]);
  });

  it('rejects zero instead of silently disabling the quota', async () => {
    const errors = await validateQuota('0');
    expect(errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ property: 'storageQuotaBytes' }),
      ]),
    );
  });

  it('rejects negative and non-numeric values', async () => {
    for (const value of ['-1', '1.5', 'ten', '']) {
      const errors = await validateQuota(value);
      expect(errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ property: 'storageQuotaBytes' }),
        ]),
      );
    }
  });
});
