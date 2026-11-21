import type { Prisma } from '@/prisma/client';
import type { ProjectScope } from '@common/domain/project-scope';

// The Prisma shape of a ProjectScope. Every project-spanning read composes one
// of these into its own `where`, so the read models cannot disagree about what
// the caller may see (ADR-082). An unrestricted scope answers `{}`, which is
// "no filter" — not an empty set.
export function projectIdFilter(scope: ProjectScope): Prisma.ProjectWhereInput {
  return scope.kind === 'all' ? {} : { id: { in: [...scope.ids] } };
}
