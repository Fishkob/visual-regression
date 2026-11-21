// The three roles the backend enforces. Kept as a list so the users form and the
// role guards read one vocabulary instead of spelling the literals.
export const USER_ROLES = ["ADMIN", "MEMBER", "VIEWER"] as const;

export type UserRole = (typeof USER_ROLES)[number];

// A missing/unknown role from an older payload is treated as MEMBER: it can
// write, but cannot manage users, keys or settings.
export const DEFAULT_ROLE: UserRole = "MEMBER";

export function isUserRole(value: unknown): value is UserRole {
  return USER_ROLES.some((role) => role === value);
}

// The permission matrix, mirrored from ADR-031: ADMIN can do everything, MEMBER
// can write but not administer, VIEWER is read-only. Components ask these
// helpers instead of re-parsing the role string.
export function isAdminRole(role: UserRole): boolean {
  return role === "ADMIN";
}

export function canWriteRole(role: UserRole): boolean {
  return role !== "VIEWER";
}

export const ROLE_BADGE_VARIANT: Record<
  UserRole,
  "default" | "secondary" | "outline"
> = {
  ADMIN: "default",
  MEMBER: "secondary",
  VIEWER: "outline",
};

export interface CurrentTeam {
  id: string;
  name: string;
}

export interface CurrentUser {
  username: string;
  role: UserRole;
  mustChangePassword: boolean;
  // True when the account is not project-scoped at all (an ADMIN, or a key
  // without an owner or allowlist). The UI uses it to say "all projects" instead
  // of naming teams, so it must default to false when the wire leaves it out.
  seesAllProjects: boolean;
  // The teams the caller belongs to. They scope project access (ADR-082); this
  // model only carries them, the API is what enforces the scope.
  teams: CurrentTeam[];
}
