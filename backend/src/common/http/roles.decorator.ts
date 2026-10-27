import { SetMetadata } from '@nestjs/common';

export type AppRole = 'ADMIN' | 'MEMBER' | 'VIEWER';

export const ROLES_KEY = 'roles';

// Route-level permission requirement. The global AuthenticationGuard resolves
// the caller's role (the session user's role, or ADMIN/MEMBER derived from an
// API key's scopes) and rejects callers outside the list with 403.
export const Roles = (...roles: AppRole[]) => SetMetadata(ROLES_KEY, roles);
