import { UnauthorizedException } from '@nestjs/common';
import type { Principal } from '@common/domain/principal';
import type { AuthenticatedRequest } from './authenticated-request';

// The request principal with the display name kept alongside the stable ids.
// The global guard attaches `auth` to every non-public route; throwing here
// keeps an audit row from being written with a fabricated identity if that ever
// stops being true.
export interface AuthenticatedPrincipal extends Principal {
  username: string;
}

export function requireAuthenticatedPrincipal(
  req: AuthenticatedRequest,
): AuthenticatedPrincipal {
  const auth = req.auth;
  if (!auth?.username) {
    throw new UnauthorizedException('Authentication required');
  }
  if (auth.apiKeyId) {
    return {
      username: auth.username,
      principalType: 'apiKey',
      principalId: auth.apiKeyId,
    };
  }
  if (auth.userId) {
    return {
      username: auth.username,
      principalType: 'user',
      principalId: auth.userId,
    };
  }
  throw new UnauthorizedException('Authentication required');
}

// The caller's display name, for audit trails and actor columns. There is no
// fallback on purpose: an audit row that names someone who did not act is worse
// than a 401, and every route that reaches this helper is already authenticated
// by the global guard — a missing principal means the guard did not run, which
// is exactly the bug a fabricated `'unknown'` used to hide.
export function requireActor(req: AuthenticatedRequest): string {
  return requireAuthenticatedPrincipal(req).username;
}

// The signed-in user's stable id, for routes that act *as* a person (my
// assignments, comment authorship, account administration). An API key is a
// credential, not a user, so it cannot stand in for one here.
export function requireUserActor(req: AuthenticatedRequest): {
  id: string;
  username: string;
} {
  const principal = requireAuthenticatedPrincipal(req);
  if (principal.principalType !== 'user') {
    throw new UnauthorizedException('This action requires a signed-in user');
  }
  return { id: principal.principalId, username: principal.username };
}
