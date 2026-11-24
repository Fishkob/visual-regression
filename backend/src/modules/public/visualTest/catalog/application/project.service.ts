import { Injectable } from '@nestjs/common';
import { PrismaUnitOfWork } from '@/prisma/prisma-unit-of-work';

import {
  ProjectRepository,
  projectNotFound,
} from '@public/visualTest/core/infrastructure/repositories/prisma-project.repository';
import { ProjectReadRepository } from '@public/visualTest/catalog/infrastructure/repositories/project-read.repository';
import { BranchCommandService } from '@public/visualTest/catalog/application/branch-command.service';
import { TestDeletionService } from '@public/visualTest/core/application/services/test-deletion.service';
import { DomainError } from '@common/domain/domain-error';
import type { ProjectScope } from '@common/domain/project-scope';
import { AuditService } from '@internal/audit/audit.service';
import { AUDIT_ACTIONS } from '@internal/audit/audit.types';
import {
  TeamsRepository,
  type TeamRef,
} from '@internal/teams/teams.repository';
import { PaginationDto } from '@common/dto/pagination.dto';
import { paginatedQuery } from '@common/utils/paginated-query';
import { createPaginatedResponse } from '@common/dto/paginated-response.dto';
import type { TestKind } from '@common/domain/test-kind';
import {
  mapProjectDetailToDto,
  mapProjectSummaryToDto,
  mapProjectToDto,
} from '@public/visualTest/catalog/infrastructure/mappers/project-response.mapper';
import type {
  CreateProjectDto,
  ProjectDto,
  UpdateProjectDto,
} from '@public/visualTest/catalog/presentation/dto/project.dto';

@Injectable()
export class ProjectService {
  constructor(
    private readonly projects: ProjectRepository,
    private readonly projectRead: ProjectReadRepository,
    private readonly testDeletion: TestDeletionService,
    private readonly teams: TeamsRepository,
    private readonly branchCommands: BranchCommandService,
    private readonly audit: AuditService,
    private readonly uow: PrismaUnitOfWork,
  ) {}

  async getAllWithPendingFlag(
    pagination: PaginationDto,
    filters: { q?: string } | undefined,
    scope: ProjectScope,
  ) {
    return paginatedQuery(
      (args) => this.projectRead.getAllWithPendingFlag(args, filters, scope),
      pagination,
      mapProjectSummaryToDto,
    );
  }

  async findAll(pagination: PaginationDto, scope: ProjectScope) {
    return paginatedQuery(
      (args) => this.projects.findAll(args, scope),
      pagination,
      mapProjectToDto,
    );
  }

  async getWithLatestVariantStatuses(
    projectName: string,
    branchName?: string,
    pagination: PaginationDto = new PaginationDto(),
    filters?: {
      q?: string;
      kind?: TestKind;
      status?: 'pending' | 'ok';
      viewport?: string;
      browser?: string;
      environment?: string;
    },
  ): Promise<ProjectDto> {
    const project = await this.projectRead.getWithLatestVariantStatuses(
      projectName,
      branchName,
      { skip: pagination.skip, take: pagination.take },
      filters,
    );
    if (!project) {
      throw projectNotFound(projectName);
    }

    // The project payload carries its own pagination meta instead of the
    // { data, meta } envelope, so derive the same truthful page the shared
    // paginatedQuery helper would report.
    const page = pagination.skipProvided
      ? Math.floor(pagination.skip / pagination.take) + 1
      : (pagination.page ?? 1);
    const meta = createPaginatedResponse(
      [],
      page,
      pagination.take,
      project.total,
    ).meta;

    return mapProjectDetailToDto(project, meta);
  }

  // Creating a project requires an owner (ADR-083). An ADMIN names any team; a
  // MEMBER one of its own; a member that belongs to none is refused with `409`
  // and a message that says why, instead of silently landing in a bucket nobody
  // is responsible for. A missing `teamId` falls back to the creator's first team
  // — the same order `/auth/me` returns and the dialog preselects — so a client
  // that does not send one still ends up with a real owner.
  async create(
    dto: CreateProjectDto,
    caller: { userId?: string; role: string },
  ): Promise<ProjectDto> {
    const team = await this.resolveOwnerTeam(dto.teamId, caller);
    const project = await this.projects.create(dto.name, team.id);
    return mapProjectSummaryToDto({
      id: project.id,
      name: project.name,
      createdAt: project.createdAt,
      teamId: team.id,
      teamName: team.name,
      isShared: false,
      pendingCount: 0,
      testCount: 0,
      hasPendingComparisons: false,
    });
  }

  // A team the caller cannot own answers `404`, not `403`: the id is
  // user-supplied, and a distinguishable answer confirms that another team
  // exists — the same reason a project outside the scope is a `404` (ADR-082).
  private async resolveOwnerTeam(
    teamId: string | undefined,
    caller: { userId?: string; role: string },
  ): Promise<TeamRef> {
    const { userId, role } = caller;
    const ownTeams = async (): Promise<TeamRef[]> =>
      userId ? this.teams.findForUser(userId) : [];
    if (teamId) {
      const team = await this.teams.findById(teamId);
      if (!team)
        throw new DomainError(`Team "${teamId}" not found`, 'NOT_FOUND');
      if (role === 'ADMIN') return { id: team.id, name: team.name };
      const own = await ownTeams();
      if (!own.some((candidate) => candidate.id === team.id)) {
        throw new DomainError(`Team "${teamId}" not found`, 'NOT_FOUND');
      }
      return { id: team.id, name: team.name };
    }
    const [first] = await ownTeams();
    if (first) return first;
    if (role === 'ADMIN') {
      throw new DomainError(
        'A project needs an owning team; name the team that owns it',
        'BAD_REQUEST',
      );
    }
    throw new DomainError(
      'You do not belong to a team yet, so you cannot create a project. Ask an admin to add you to the team that should own it.',
      'CONFLICT',
    );
  }

  // Visibility is its own audited write (ADR-083): it widens who may *read* the
  // project, so it must not ride on the generic project patch, which is gated by
  // an API-key scope rather than by `@Roles`.
  async updateVisibility(
    projectName: string,
    isShared: boolean,
    actor: string,
  ): Promise<{ projectName: string; isShared: boolean }> {
    const project = await this.projects.requireByName(projectName);
    const isCurrentlyShared = project.isShared ?? false;
    if (isCurrentlyShared === isShared) {
      return { projectName: project.name, isShared };
    }
    await this.uow.execute(async () => {
      await this.projects.updateVisibilityByName(project.name, isShared);
      await this.audit.record({
        actor: actor ?? null,
        action: AUDIT_ACTIONS.projectVisibility,
        projectName: project.name,
        targetType: 'project',
        targetId: project.id,
        metadata: { from: isCurrentlyShared, to: isShared },
      });
    });
    return { projectName: project.name, isShared };
  }

  async updateRetention(
    projectName: string,
    data: {
      baselineRevisionLimit?: number | null;
      runHistoryDays?: number | null;
      branchRetentionDays?: number | null;
      orphanGraceHours?: number | null;
      // A validated positive-integer string or null; parsing lives here so the
      // controller stops coercing transport values into the domain type.
      storageQuotaBytes?: string | null;
      quotaSoftPercent?: number | null;
    },
    actor: string,
  ): Promise<void> {
    const project = await this.projects.requireByName(projectName);
    const quotaBytes =
      data.storageQuotaBytes === undefined || data.storageQuotaBytes === null
        ? data.storageQuotaBytes
        : BigInt(data.storageQuotaBytes);
    // The settings write and its trail commit together: retention decides which
    // evidence survives, so a change without the row that says who made it is a
    // policy decision nobody can audit.
    await this.uow.execute(async () => {
      await this.projects.updateRetention(projectName, {
        ...data,
        storageQuotaBytes: quotaBytes,
      });
      await this.audit.record({
        actor: actor ?? null,
        action: AUDIT_ACTIONS.storageRetention,
        projectName,
        targetType: 'project',
        targetId: project.id,
        metadata: { ...retentionDiff(project, data) },
      });
    });
  }

  async rename(
    projectName: string,
    newName: string,
    actor: string,
  ): Promise<void> {
    const trimmed = newName.trim();
    if (trimmed === projectName) return;
    const existing = await this.projects.requireByName(projectName);
    await this.uow
      .execute(async () => {
        await this.projects.rename(projectName, trimmed);
        await this.audit.record({
          actor: actor ?? null,
          action: AUDIT_ACTIONS.projectRename,
          projectName: trimmed,
          targetType: 'project',
          targetId: existing.id,
          metadata: { renamedFrom: projectName },
        });
      })
      .catch((error: unknown) => {
        if ((error as { code?: string }).code === 'P2002') {
          throw new DomainError(
            `Project "${trimmed}" already exists`,
            'CONFLICT',
          );
        }
        throw error;
      });
  }

  async updatePixelThreshold(
    projectName: string,
    pixelDiffThreshold: number | null,
    actor: string,
  ): Promise<{ pixelDiffThreshold: number | null }> {
    const project = await this.projects.requireByName(projectName);
    const from = project.pixelDiffThreshold ?? null;
    // The write and its trail commit together: raising the default tolerates
    // diffs that were reviewable before, so a change without a record of who
    // made it would be a silent policy shift.
    await this.uow.execute(async () => {
      await this.projects.updatePixelDiffThreshold(
        projectName,
        pixelDiffThreshold,
      );
      await this.audit.record({
        actor: actor ?? null,
        action: AUDIT_ACTIONS.projectPixelThreshold,
        projectName,
        targetType: 'project',
        targetId: project.id,
        metadata: { from, to: pixelDiffThreshold },
      });
    });
    return { pixelDiffThreshold };
  }

  // The generic project patch is down to its one remaining field: the default
  // branch. The owner, the visibility and the threshold each have their own
  // ADMIN-only route, because each of them is a privilege decision rather than a
  // settings edit (ADR-082, ADR-083).
  async updateDefaultBranch(
    projectName: string,
    dto: UpdateProjectDto,
  ): Promise<ProjectDto> {
    if (dto.defaultBranchName === undefined) {
      return this.getWithLatestVariantStatuses(projectName);
    }
    await this.branchCommands.setDefault(projectName, dto.defaultBranchName);
    return this.getWithLatestVariantStatuses(projectName);
  }

  async deleteProject(projectName: string, actor: string): Promise<void> {
    // Existence is resolved (and NOT_FOUND thrown) inside the deletion's
    // transaction — TestDeletionService owns the single read of the project.
    await this.testDeletion.deleteProject(projectName, actor);
  }
}

// The audit row reads as a diff: `to` carries only the keys the patch touched,
// and `from` mirrors exactly those keys so a reader sees the previous value of
// what changed rather than a full settings dump. BigInt is stringified because
// audit metadata is JSON.
const RETENTION_KEYS = [
  'baselineRevisionLimit',
  'runHistoryDays',
  'branchRetentionDays',
  'orphanGraceHours',
  'storageQuotaBytes',
  'quotaSoftPercent',
] as const;

type RetentionKey = (typeof RETENTION_KEYS)[number];

function retentionDiff(
  from: Partial<Record<RetentionKey, unknown>>,
  to: Partial<Record<RetentionKey, unknown>>,
): RetentionDiff {
  const before: Record<string, AuditValue> = {};
  const after: Record<string, AuditValue> = {};
  for (const key of RETENTION_KEYS) {
    if (to[key] === undefined) continue;
    before[key] = auditValue(from[key]);
    after[key] = auditValue(to[key]);
  }
  return { from: before, to: after };
}

type AuditValue = number | string | null;

interface RetentionDiff {
  from: Record<string, AuditValue>;
  to: Record<string, AuditValue>;
}

function auditValue(value: unknown): AuditValue {
  if (value === undefined || value === null) return null;
  return typeof value === 'bigint' ? value.toString() : (value as number);
}
