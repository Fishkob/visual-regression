// What a principal may see (ADR-082). One value, resolved once per request, so
// the guard and the read models cannot disagree about "which projects".
//
// `all` is the administrator's answer and the answer for a principal that is not
// project-scoped at all. `ids` is an explicit set of project ids *including the
// shared ones*: a shared project belongs to every principal's set, and the owner
// of a shared project sees it anyway. Keeping the shared rule in the resolver
// (rather than in every consumer) is what makes the predicate below a plain set
// lookup — a list filter built from `ids` needs no second branch.
//
// The set is materialized per request. For a self-hosted deployment with tens of
// projects that is cheaper than a join on every read; the id list travels to the
// database as one `IN (...)` and hits `Project_pkey`.
export type ProjectScope =
  | { readonly kind: 'all' }
  | { readonly kind: 'ids'; readonly ids: ReadonlySet<string> };

export const ALL_PROJECTS: ProjectScope = { kind: 'all' };

export function scopeAllows(scope: ProjectScope, projectId: string): boolean {
  return scope.kind === 'all' || scope.ids.has(projectId);
}

// Used for an API key: its effective scope is the intersection of its owner's
// scope and its own allowlist (ADR-082). An empty allowlist means "no
// restriction" and leaves the owner's scope untouched.
export function restrictScope(
  scope: ProjectScope,
  allowedIds: readonly string[],
): ProjectScope {
  if (allowedIds.length === 0) return scope;
  const allowed = new Set(allowedIds);
  if (scope.kind === 'ids') {
    return {
      kind: 'ids',
      ids: new Set([...scope.ids].filter((id) => allowed.has(id))),
    };
  }
  return { kind: 'ids', ids: allowed };
}
