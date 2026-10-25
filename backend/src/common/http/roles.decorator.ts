import { SetMetadata } from '@nestjs/common';

export type AppRole = 'ADMIN' | 'MEMBER' | 'VIEWER';

export const ROLES_KEY = 'roles';

// Route-level permission requirement. The global AuthenticationGuard resolves
// the caller's role (session user role, or MEMBER for API keys until R11) and
// rejects callers outside the list with 403.
export const Roles = (...roles: AppRole[]) => SetMetadata(ROLES_KEY, roles);
