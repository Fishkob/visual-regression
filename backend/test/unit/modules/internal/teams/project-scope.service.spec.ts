import type { Mocked } from 'vitest';
import { ProjectScopeService } from '@internal/teams/project-scope.service';
import { TeamsRepository } from '@internal/teams/teams.repository';
import { ALL_PROJECTS } from '@common/domain/project-scope';
import { createMock } from '@test/utils/create-mock';

describe('ProjectScopeService', () => {
  let service: ProjectScopeService;
  let teams: Mocked<TeamsRepository>;

  beforeEach(() => {
    teams = createMock<TeamsRepository>();
    teams.findVisibleProjectIdsForUser.mockResolvedValue(['p-1', 'p-shared']);
    service = new ProjectScopeService(teams);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('forUser', () => {
    it('is unrestricted for an admin, without reading the teams', async () => {
      await expect(service.forUser('u-1', 'ADMIN')).resolves.toBe(ALL_PROJECTS);
      expect(teams.findVisibleProjectIdsForUser).not.toHaveBeenCalled();
    });

    it('is the member’s visible set, shared projects included', async () => {
      const scope = await service.forUser('u-1', 'MEMBER');

      expect(scope).toEqual({
        kind: 'ids',
        ids: new Set(['p-1', 'p-shared']),
      });
      expect(teams.findVisibleProjectIdsForUser).toHaveBeenCalledWith('u-1');
    });

    it('is empty for a viewer with no team, which sees only shared projects', async () => {
      teams.findVisibleProjectIdsForUser.mockResolvedValue(['p-shared']);

      await expect(service.forUser('u-2', 'VIEWER')).resolves.toEqual({
        kind: 'ids',
        ids: new Set(['p-shared']),
      });
    });
  });

  describe('forApiKey', () => {
    it('inherits the owner’s scope when the key has no allowlist', async () => {
      const scope = await service.forApiKey({
        ownerId: 'u-1',
        ownerRole: 'MEMBER',
        allowlist: [],
      });

      expect(scope).toEqual({
        kind: 'ids',
        ids: new Set(['p-1', 'p-shared']),
      });
    });

    it('intersects the owner’s scope with the key allowlist', async () => {
      const scope = await service.forApiKey({
        ownerId: 'u-1',
        ownerRole: 'MEMBER',
        allowlist: ['p-1', 'p-foreign'],
      });

      // The owner cannot see `p-foreign`, so neither can its key.
      expect(scope).toEqual({ kind: 'ids', ids: new Set(['p-1']) });
    });

    it('gives an admin-owned key its own allowlist', async () => {
      const scope = await service.forApiKey({
        ownerId: 'admin',
        ownerRole: 'ADMIN',
        allowlist: ['p-9'],
      });

      expect(scope).toEqual({ kind: 'ids', ids: new Set(['p-9']) });
    });

    it('leaves an ownerless key on its allowlist semantics', async () => {
      await expect(
        service.forApiKey({ ownerId: null, ownerRole: null, allowlist: [] }),
      ).resolves.toBe(ALL_PROJECTS);
      await expect(
        service.forApiKey({
          ownerId: null,
          ownerRole: null,
          allowlist: ['p-7'],
        }),
      ).resolves.toEqual({ kind: 'ids', ids: new Set(['p-7']) });
    });
  });
});
