import { SetMetadata } from '@nestjs/common';

export const API_KEY_SCOPE_KEY = 'auth:api-key-scope';

// The API-key capability a route needs, declared on the route instead of derived
// from its path. The guard used to infer it from substrings ('/upload',
// '/approval', a '/jobs/' exception) and fell through to `admin`, so renaming a
// route silently changed who could call it, and every new write quietly required
// the admin scope whether or not that was meant.
//
// The value is a list: the route is satisfied by any one of the declared scopes
// (the job-status read accepts `upload` or `read`, because a CI that just
// uploaded wants to poll its own job). Session callers ignore this metadata —
// they are governed by @Roles. An API key cannot call a route that declares no
// scope at all, so a new endpoint has to make the decision instead of
// inheriting one.
export type ApiKeyScope = 'read' | 'upload' | 'approve' | 'admin';

export const Scope = (...scopes: ApiKeyScope[]) =>
  SetMetadata(API_KEY_SCOPE_KEY, scopes);
