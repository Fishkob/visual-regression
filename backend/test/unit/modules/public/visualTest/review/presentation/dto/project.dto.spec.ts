import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  CreateProjectDto,
  UpdateProjectDto,
} from '@public/visualTest/catalog/presentation/dto/project.dto';

describe('Project group DTO validation', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('rejects an empty groupId on CreateProjectDto', async () => {
    const dto = plainToInstance(CreateProjectDto, {
      name: 'checkout-ui',
      groupId: '',
    });

    const errors = await validate(dto, { whitelist: true });

    expect(errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ property: 'groupId' }),
      ]),
    );
  });

  it('rejects an empty groupId on UpdateProjectDto', async () => {
    const dto = plainToInstance(UpdateProjectDto, { groupId: '' });

    const errors = await validate(dto, { whitelist: true });

    expect(errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ property: 'groupId' }),
      ]),
    );
  });

  it('allows null on UpdateProjectDto to unassign a project', async () => {
    const dto = plainToInstance(UpdateProjectDto, { groupId: null });

    await expect(validate(dto, { whitelist: true })).resolves.toEqual([]);
  });
});
