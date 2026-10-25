import type { UserRole } from "@/domains/auth/auth.model";

// One managed account. The nullable columns are denormalized actor/audit data:
// `createdBy` is the admin's username (kept after that admin is gone) and
// `deactivatedAt` is when the account was switched off, if it was.
export interface User {
  id: string;
  username: string;
  role: UserRole;
  isActive: boolean;
  mustChangePassword: boolean;
  deactivatedAt: string | null;
  createdBy: string | null;
  createdAt: string;
}

/** The create answer: the temporary password is shown exactly once. */
export interface CreatedUser {
  user: User;
  temporaryPassword: string;
}

export interface ResetPasswordResult {
  temporaryPassword: string;
}

export interface CreateUserInput {
  username: string;
  role: UserRole;
}

export interface UpdateUserInput {
  id: string;
  role?: UserRole;
  isActive?: boolean;
}
