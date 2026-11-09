import type {
  CreatedUserDto,
  InvitePreviewDto,
  ResetPasswordResultDto,
  UserDto,
  UserInviteLinkDto,
} from "@sdk";
import { DEFAULT_ROLE, isUserRole } from "@/domains/auth/auth.model";
import {
  isUserInviteStatus,
  type CreatedUser,
  type ResetPasswordResult,
  type User,
  type UserInviteLink,
  type UserInvitePreview,
} from "./user.model";

// The generated DTO types the nullable audit columns as free-form objects (the
// backend declares them nullable but untyped), so the source widens exactly
// those columns and the mapper normalizes every spelling to one absent value —
// same seam as the run/webhook mappers.
export type UserSource = Omit<UserDto, "deactivatedAt" | "createdBy"> & {
  deactivatedAt?: unknown;
  createdBy?: unknown;
};

function presentString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

// The wire carries ISO strings; a `Date` is accepted too because the backend DTO
// declares these columns as dates and a direct (non-JSON) call would hand one
// over.
function presentIso(value: unknown): string | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }
  return presentString(value);
}

export function mapUser(dto: UserSource): User {
  return {
    id: String(dto.id ?? ""),
    username: dto.username ?? "",
    role: isUserRole(dto.role) ? dto.role : DEFAULT_ROLE,
    isActive: dto.isActive !== false,
    mustChangePassword: dto.mustChangePassword === true,
    deactivatedAt: presentIso(dto.deactivatedAt),
    createdBy: presentString(dto.createdBy),
    createdAt: presentIso(dto.createdAt) ?? "",
  };
}

export function mapUsers(dtos: UserDto[] | undefined): User[] {
  return (dtos ?? []).map(mapUser);
}

export function mapUserInviteLink(
  dto: UserInviteLinkDto | undefined,
): UserInviteLink {
  return {
    token: dto?.token ?? "",
    expiresAt: presentIso(dto?.expiresAt) ?? "",
  };
}

export function mapCreatedUser(dto: CreatedUserDto): CreatedUser {
  return {
    user: mapUser(dto.user),
    invite: mapUserInviteLink(dto.invite),
  };
}

export function mapResetPasswordResult(
  dto: ResetPasswordResultDto,
): ResetPasswordResult {
  return { invite: mapUserInviteLink(dto.invite) };
}

// An unrecognized status reads as "used": the page must not offer a reveal that
// the API would refuse anyway, and a newer backend status is likelier to
// withdraw the link than to renew it.
export function mapUserInvitePreview(dto: InvitePreviewDto): UserInvitePreview {
  return {
    username: dto.username ?? "",
    role: isUserRole(dto.role) ? dto.role : DEFAULT_ROLE,
    expiresAt: presentIso(dto.expiresAt) ?? "",
    status: isUserInviteStatus(dto.status) ? dto.status : "used",
  };
}
