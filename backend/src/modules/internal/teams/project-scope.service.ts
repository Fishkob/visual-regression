import { Injectable } from '@nestjs/common';
import {
  ALL_PROJECTS,
  restrictScope,
  type ProjectScope,
} from '@common/domain/project-scope';
import { TeamsRepository } from '@internal/teams/teams.repository';

// The one owner of "which projects may this principal see" (ADR-082). The guard
// resolves it once per request and hangs it on the request; the read models
// consume it. Nothing else derives a project set, so the guard and a list query
// cannot disagree.
@Injectable()
export class ProjectScopeService {
  constructor(private readonly teams: TeamsRepository) {}

  // A session: an admin is unrestricted, everyone else sees the projects of
  // their teams plus every shared project (ADR-083).
  async forUser(userId: string, role: string): Promise<ProjectScope> {
    if (role === 'ADMIN') return ALL_PROJECTS;
    const ids = await this.teams.findVisibleProjectIdsForUser(userId);
    return { kind: 'ids', ids: new Set(ids) };
  }

  // An API key: the intersection of what its owner may see and its own
  // allowlist. A key without an owner keeps its allowlist semantics — there is
  // no user whose scope it could inherit. A team boundary that a CI key from
  // another team could cross is not a boundary, which is why this is not just
  // the allowlist.
  async forApiKey(key: {
    ownerId: string | null;
    ownerRole: string | null;
    allowlist: readonly string[];
  }): Promise<ProjectScope> {
    const base =
      key.ownerId && key.ownerRole
        ? await this.forUser(key.ownerId, key.ownerRole)
        : ALL_PROJECTS;
    return restrictScope(base, key.allowlist);
  }
}
