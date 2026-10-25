import type { RecoveryCodesDto, SessionDto, TwoFactorSetupDto } from "@sdk";
import type { RecoveryCodes, Session, TwoFactorSetup } from "./security.model";

// The generated DTO types the nullable request-metadata columns as free-form
// objects (the backend declares them nullable but untyped), so the source widens
// exactly those columns and the mapper normalizes every spelling to one absent
// value — same seam as the run/webhook mappers.
export type SessionSource = Omit<
  SessionDto,
  "lastSeenAt" | "ip" | "userAgent"
> & {
  lastSeenAt?: unknown;
  ip?: unknown;
  userAgent?: unknown;
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

export function mapSession(dto: SessionSource): Session {
  return {
    id: String(dto.id ?? ""),
    createdAt: presentIso(dto.createdAt) ?? "",
    lastSeenAt: presentIso(dto.lastSeenAt),
    expiresAt: presentIso(dto.expiresAt) ?? "",
    ip: presentString(dto.ip),
    userAgent: presentString(dto.userAgent),
    isCurrent: dto.isCurrent === true,
  };
}

// The endpoint answers the current session first (then newest activity); mapping
// preserves the server order.
export function mapSessions(dtos: SessionDto[] | undefined): Session[] {
  return (dtos ?? []).map(mapSession);
}

export function mapTwoFactorSetup(
  dto: TwoFactorSetupDto | undefined,
): TwoFactorSetup {
  return {
    secret: dto?.secret ?? "",
    otpauthUrl: dto?.otpauthUrl ?? "",
  };
}

// The OpenAPI schema declares recoveryCodes as an array of arrays (the Swagger
// `type: [String], isArray: true` combination doubles the nesting) while the
// backend sends a flat string[]. Normalizing both shapes here keeps the rest of
// the UI from having to know which one it got.
export function mapRecoveryCodes(
  dto: RecoveryCodesDto | undefined,
): RecoveryCodes {
  const value = dto?.recoveryCodes as unknown;
  if (!Array.isArray(value)) return [];
  return (value as unknown[])
    .flatMap((entry) => (Array.isArray(entry) ? (entry as unknown[]) : [entry]))
    .filter(
      (code): code is string => typeof code === "string" && code.length > 0,
    );
}

// "Log out other sessions" answers { revoked } but the generated SDK types the
// stop body as unknown; the count is read defensively and shown in the toast.
export function mapRevokeAllResult(value: unknown): number {
  if (typeof value !== "object" || value === null) return 0;
  const revoked = (value as { revoked?: unknown }).revoked;
  return typeof revoked === "number" && Number.isFinite(revoked) ? revoked : 0;
}
