import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  CreateProjectDto,
  ProjectsListQueryDto,
} from '@public/visualTest/catalog/presentation/dto/project.dto';

// The project DTOs lost their group fields with the concept (ADR-084), and
// gained the owner (ADR-083). What is pinned here is the wire contract the SDK
// and the seeder both rely on.
describe('Project DTO validation', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('rejects an empty teamId on CreateProjectDto', async () => {
    const dto = plainToInstance(CreateProjectDto, {
      name: 'checkout-ui',
      teamId: '',
    });

    const errors = await validate(dto, { whitelist: true });

    expect(errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ property: 'teamId' })]),
    );
  });

  // Omitting the owner is allowed on the wire: the service falls back to the
  // creator's first team, and a member without one is refused with a 409 that
  // explains itself — a 400 from the validator could not say that.
  it('accepts a CreateProjectDto without a teamId', async () => {
    const dto = plainToInstance(CreateProjectDto, { name: 'checkout-ui' });

    await expect(validate(dto, { whitelist: true })).resolves.toEqual([]);
  });

  it('rejects a groupId on the list query instead of ignoring it', async () => {
    const dto = plainToInstance(ProjectsListQueryDto, { groupId: 'g-1' });

    const errors = await validate(dto, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });

    expect(errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ property: 'groupId' }),
      ]),
    );
  });
});
