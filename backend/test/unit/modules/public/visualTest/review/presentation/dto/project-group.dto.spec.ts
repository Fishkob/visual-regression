import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  CreateProjectGroupDto,
  UpdateProjectGroupDto,
} from '@public/visualTest/review/presentation/dto/project-group.dto';

describe('Project group name DTO validation', () => {
  it('rejects the reserved Unassigned label on CreateProjectGroupDto', async () => {
    const dto = plainToInstance(CreateProjectGroupDto, {
      name: 'Unassigned',
    });

    const errors = await validate(dto);

    expect(errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ property: 'name' })]),
    );
  });

  it('rejects the reserved Unassigned label on UpdateProjectGroupDto', async () => {
    const dto = plainToInstance(UpdateProjectGroupDto, {
      name: 'Unassigned',
    });

    const errors = await validate(dto);

    expect(errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ property: 'name' })]),
    );
  });

  it('allows a case-variant of the reserved label', async () => {
    const dto = plainToInstance(CreateProjectGroupDto, {
      name: 'unassigned',
    });

    await expect(validate(dto)).resolves.toEqual([]);
  });

  it('trims surrounding whitespace before checking the reserved label', async () => {
    const dto = plainToInstance(CreateProjectGroupDto, {
      name: '  Unassigned  ',
    });

    const errors = await validate(dto);

    expect(errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ property: 'name' })]),
    );
  });
});
