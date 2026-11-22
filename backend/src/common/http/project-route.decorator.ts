import { SetMetadata } from '@nestjs/common';

export const PROJECT_ROUTE_KEY = 'auth:project-route';

// How a route relates to projects, declared on the route instead of inferred
// from its path (ADR-082). The guard reads it, and the contract test refuses a
// route that declares nothing — the same lesson ADR-045 applied to API-key
// scopes, where a path-derived guess silently granted the widest answer.
//
//   scoped    the request's authority is exactly one project
//   spanning  the route reads or writes across projects
//   global    the route names no project and returns none
//
// `scoped` routes are refused outside the caller's ProjectScope in the guard.
// `spanning` reads are filtered by their repository (the scope is a required
// argument) and a project-spanning write must assert each project it touches.
export type ProjectRouteKind = 'scoped' | 'spanning' | 'global';

export const ProjectScoped = () => SetMetadata(PROJECT_ROUTE_KEY, 'scoped');

export const ProjectSpanning = () => SetMetadata(PROJECT_ROUTE_KEY, 'spanning');

export const GlobalRoute = () => SetMetadata(PROJECT_ROUTE_KEY, 'global');
