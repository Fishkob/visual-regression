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

// The link an admin hands over instead of a password. `token` is the secret in
// the URL and the only copy that exists — the server keeps its hash.
export interface UserInviteLink {
  token: string;
  expiresAt: string;
}

/** The create answer: the link, never the password it reveals. */
export interface CreatedUser {
  user: User;
  invite: UserInviteLink;
}

export interface ResetPasswordResult {
  invite: UserInviteLink;
}

export const USER_INVITE_STATUSES = ["pending", "used", "expired"] as const;

export type UserInviteStatus = (typeof USER_INVITE_STATUSES)[number];

/** What the public invite page learns before it spends the one reveal. */
export interface UserInvitePreview {
  username: string;
  role: UserRole;
  expiresAt: string;
  status: UserInviteStatus;
}

export function isUserInviteStatus(value: unknown): value is UserInviteStatus {
  return (
    typeof value === "string" &&
    (USER_INVITE_STATUSES as readonly string[]).includes(value)
  );
}

export function invitePath(token: string): string {
  return `/invite/${encodeURIComponent(token)}`;
}

// The full URL shown after creation. Built from the current origin, so a copied
// link works without the dashboard's route prefix — same rule as a share link.
export function inviteUrl(token: string): string {
  return `${window.location.origin}${invitePath(token)}`;
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
