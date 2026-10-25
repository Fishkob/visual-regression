import type { CreatedUserDto, ResetPasswordResultDto, UserDto } from "@sdk";
import { DEFAULT_ROLE, isUserRole } from "@/domains/auth/auth.model";
import type { CreatedUser, ResetPasswordResult, User } from "./user.model";

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

export function mapCreatedUser(dto: CreatedUserDto): CreatedUser {
  return {
    user: mapUser(dto.user),
    temporaryPassword: dto.temporaryPassword ?? "",
  };
}

export function mapResetPasswordResult(
  dto: ResetPasswordResultDto,
): ResetPasswordResult {
  return { temporaryPassword: dto.temporaryPassword ?? "" };
}
