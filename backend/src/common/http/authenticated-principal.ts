import { UnauthorizedException } from '@nestjs/common';
import type { ApprovalPrincipal } from '@common/domain/approval-principal';
import type { AuthenticatedRequest } from './authenticated-request';

// The request principal with the display name kept alongside the stable ids the
// approval path needs. The global guard attaches `auth` to every non-public
// route; throwing here keeps an approval from being written with a fabricated
// identity if that ever stops being true.
export interface AuthenticatedPrincipal extends ApprovalPrincipal {
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
