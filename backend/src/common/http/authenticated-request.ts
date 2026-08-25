import type { Request } from 'express';

// The authenticated principal attached to a request by the global
// AuthenticationGuard. Both auth paths (session cookie and api key) set it.
export interface AuthenticatedRequest extends Request {
  auth?: { username: string; apiKeyId?: string };
}
