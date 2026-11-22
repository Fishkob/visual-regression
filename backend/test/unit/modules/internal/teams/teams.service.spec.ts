import type { Mocked } from 'vitest';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { TeamsService } from '@internal/teams/teams.service';
import {
  TeamsRepository,
  type TeamRow,
} from '@internal/teams/teams.repository';
import { AuditService } from '@internal/audit/audit.service';
import { ProjectRepository } from '@public/visualTest/core/infrastructure/repositories/prisma-project.repository';
import { createMock } from '@test/utils/create-mock';
import { createMockProjectRepository, createMockUoW } from '@test/utils/mocks';

function team(overrides: Partial<TeamRow> = {}): TeamRow {
  return {
    id: 't-1',
    name: 'Checkout',
    createdBy: 'admin',
    createdAt: new Date('2026-01-01'),
    members: [
      { userId: 'u-1', username: 'alice', role: 'MEMBER' },
      { userId: 'u-2', username: 'bob', role: 'MEMBER' },
    ],
    projects: [],
    ...overrides,
  };
}

describe('TeamsService', () => {
  let service: TeamsService;
  let teams: Mocked<TeamsRepository>;
  let projects: Mocked<ProjectRepository>;
  let audit: Mocked<AuditService>;

  beforeEach(() => {
    teams = createMock<TeamsRepository>();
    teams.findById.mockResolvedValue(team());
    teams.findByName.mockResolvedValue(null);
    teams.countProjects.mockResolvedValue(0);
    projects = createMockProjectRepository();
    audit = createMock<AuditService>();
    audit.record.mockResolvedValue(undefined);
    service = new TeamsService(teams, projects, audit, createMockUoW());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('create', () => {
    it('trims the name and records who created the team', async () => {
      teams.create.mockResolvedValue(team({ name: 'Checkout' }));

      const created = await service.create('admin', '  Checkout  ');

      expect(teams.create).toHaveBeenCalledWith('Checkout', 'admin');
      expect(created.name).toBe('Checkout');
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          actor: 'admin',
          action: 'team.create',
          targetType: 'team',
          targetId: 't-1',
          metadata: { name: 'Checkout' },
        }),
      );
    });

    it('rejects a name that is already taken', async () => {
      teams.findByName.mockResolvedValue({ id: 't-9', name: 'Checkout' });

      await expect(service.create('admin', 'Checkout')).rejects.toThrow(
        ConflictException,
      );
      expect(teams.create).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
    });
  });

  describe('rename', () => {
    it('records the previous name', async () => {
      teams.rename.mockResolvedValue(team({ name: 'Storefront' }));

      const renamed = await service.rename('admin', 't-1', 'Storefront');

      expect(renamed.name).toBe('Storefront');
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'team.update',
          metadata: { from: 'Checkout', to: 'Storefront' },
        }),
      );
    });

    it('writes nothing when the name did not change', async () => {
      const renamed = await service.rename('admin', 't-1', ' Checkout ');

      expect(renamed.id).toBe('t-1');
      expect(teams.rename).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
    });

    it('rejects a name owned by another team', async () => {
      teams.findByName.mockResolvedValue({ id: 't-2', name: 'Storefront' });

      await expect(
        service.rename('admin', 't-1', 'Storefront'),
      ).rejects.toThrow(ConflictException);
      expect(teams.rename).not.toHaveBeenCalled();
    });

    it('accepts its own current name as a no-op', async () => {
      teams.findByName.mockResolvedValue({ id: 't-1', name: 'Checkout' });

      await service.rename('admin', 't-1', 'Checkout');

      expect(teams.rename).not.toHaveBeenCalled();
    });
  });

  describe('replaceMembers', () => {
    it('writes the set and records who was added and removed', async () => {
      teams.findExistingUserIds.mockResolvedValue(new Set(['u-2', 'u-3']));
      teams.findById.mockResolvedValueOnce(team()).mockResolvedValueOnce(
        team({
          members: [
            { userId: 'u-2', username: 'bob', role: 'MEMBER' },
            { userId: 'u-3', username: 'carol', role: 'MEMBER' },
          ],
        }),
      );

      const updated = await service.replaceMembers('admin', 't-1', [
        'u-2',
        'u-3',
      ]);

      expect(teams.replaceMembers).toHaveBeenCalledWith('t-1', ['u-2', 'u-3']);
      expect(updated.members.map((member) => member.userId)).toEqual([
        'u-2',
        'u-3',
      ]);
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'team.members',
          metadata: expect.objectContaining({
            name: 'Checkout',
            addedUserIds: ['u-3'],
            removedUserIds: ['u-1'],
            removedUsernames: ['alice'],
          }),
        }),
      );
    });

    it('rejects an unknown user id instead of letting the foreign key fail', async () => {
      teams.findExistingUserIds.mockResolvedValue(new Set(['u-2']));

      await expect(
        service.replaceMembers('admin', 't-1', ['u-2', 'ghost']),
      ).rejects.toThrow(BadRequestException);
      expect(teams.replaceMembers).not.toHaveBeenCalled();
    });

    it('treats a duplicate in the payload as one membership', async () => {
      teams.findExistingUserIds.mockResolvedValue(new Set(['u-1', 'u-3']));
      teams.findById
        .mockResolvedValueOnce(team())
        .mockResolvedValueOnce(team());

      await service.replaceMembers('admin', 't-1', ['u-1', 'u-3', 'u-1']);

      expect(teams.replaceMembers).toHaveBeenCalledWith('t-1', ['u-1', 'u-3']);
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({ addedUserIds: ['u-3'] }),
        }),
      );
    });

    it('writes nothing when the set is unchanged', async () => {
      const unchanged = await service.replaceMembers('admin', 't-1', [
        'u-1',
        'u-2',
      ]);

      expect(unchanged.id).toBe('t-1');
      expect(teams.findExistingUserIds).not.toHaveBeenCalled();
      expect(teams.replaceMembers).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
    });

    it('allows removing every member', async () => {
      teams.findById
        .mockResolvedValueOnce(team())
        .mockResolvedValueOnce(team({ members: [] }));

      const emptied = await service.replaceMembers('admin', 't-1', []);

      expect(teams.findExistingUserIds).not.toHaveBeenCalled();
      expect(teams.replaceMembers).toHaveBeenCalledWith('t-1', []);
      expect(emptied.members).toEqual([]);
    });
  });

  describe('remove', () => {
    it('refuses to delete a team that still owns projects', async () => {
      teams.countProjects.mockResolvedValue(2);

      await expect(service.remove('admin', 't-1')).rejects.toThrow(
        ConflictException,
      );
      expect(teams.delete).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
    });

    it('deletes an empty team and records the member count', async () => {
      teams.delete.mockResolvedValue(undefined);

      const result = await service.remove('admin', 't-1');

      expect(result).toEqual({ success: true });
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'team.delete',
          targetId: 't-1',
          metadata: { name: 'Checkout', memberCount: 2 },
        }),
      );
    });

    it('maps a foreign-key race to a conflict instead of a 500', async () => {
      teams.delete.mockRejectedValue(
        Object.assign(new Error('fk'), { code: 'P2003' }),
      );

      await expect(service.remove('admin', 't-1')).rejects.toThrow(
        ConflictException,
      );
      expect(audit.record).not.toHaveBeenCalled();
    });

    it('reports a missing team as not found', async () => {
      teams.findById.mockResolvedValue(null);

      await expect(service.remove('admin', 't-1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('assignProject', () => {
    const project = {
      id: 'p-1',
      name: 'checkout-ui',
      createdAt: new Date('2026-01-01'),
      teamId: null,
    };

    it('records the assignment with both team names', async () => {
      projects.findByName.mockResolvedValue(project as never);
      projects.updateTeamByName.mockResolvedValue(project as never);

      const view = await service.assignProject('admin', 'checkout-ui', 't-1');

      expect(projects.updateTeamByName).toHaveBeenCalledWith(
        'checkout-ui',
        't-1',
      );
      expect(view).toEqual({
        projectId: 'p-1',
        projectName: 'checkout-ui',
        teamId: 't-1',
        teamName: 'Checkout',
      });
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'team.project-assign',
          projectName: 'checkout-ui',
          targetType: 'project',
          targetId: 'p-1',
          metadata: { from: null, to: 'Checkout' },
        }),
      );
    });

    it('records the previous owner when the project moves', async () => {
      projects.findByName.mockResolvedValue({
        ...project,
        teamId: 't-old',
      });
      teams.findById.mockImplementation(async (id: string) =>
        id === 't-old' ? team({ id: 't-old', name: 'Legacy' }) : team(),
      );

      await service.assignProject('admin', 'checkout-ui', 't-1');

      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: { from: 'Legacy', to: 'Checkout' },
        }),
      );
    });

    it('unassigning writes the shared state and the trail', async () => {
      projects.findByName.mockResolvedValue({
        ...project,
        teamId: 't-1',
      });
      projects.updateTeamByName.mockResolvedValue(project as never);

      const view = await service.assignProject('admin', 'checkout-ui', null);

      expect(projects.updateTeamByName).toHaveBeenCalledWith(
        'checkout-ui',
        null,
      );
      expect(view.teamId).toBeNull();
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: { from: 'Checkout', to: null },
        }),
      );
    });

    it('writes nothing when the project already belongs to that team', async () => {
      projects.findByName.mockResolvedValue({
        ...project,
        teamId: 't-1',
      });

      const view = await service.assignProject('admin', 'checkout-ui', 't-1');

      expect(projects.updateTeamByName).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
      expect(view.teamId).toBe('t-1');
    });

    it('reports an unknown project as not found', async () => {
      projects.findByName.mockResolvedValue(null);

      // The project lookup keeps the repository's DomainError shape, which the
      // global filter maps to 404, rather than a second "not found" wording.
      await expect(
        service.assignProject('admin', 'ghost', 't-1'),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    });

    it('reports an unknown team as not found', async () => {
      projects.findByName.mockResolvedValue(project as never);
      teams.findById.mockResolvedValue(null);

      await expect(
        service.assignProject('admin', 'checkout-ui', 'ghost'),
      ).rejects.toThrow(NotFoundException);
      expect(projects.updateTeamByName).not.toHaveBeenCalled();
    });
  });

  it('lists the caller memberships for /auth/me', async () => {
    teams.findForUser.mockResolvedValue([{ id: 't-1', name: 'Checkout' }]);

    await expect(service.teamsForUser('u-1')).resolves.toEqual([
      { id: 't-1', name: 'Checkout' },
    ]);
    expect(teams.findForUser).toHaveBeenCalledWith('u-1');
  });
});
