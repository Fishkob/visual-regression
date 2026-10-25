import type { MeDto } from "@sdk";
import {
  DEFAULT_ROLE,
  isUserRole,
  type CurrentUser,
  type LoginResult,
} from "./auth.model";

// The generated MeDto types role/mustChangePassword/totpEnabled as required, but
// an older backend (or a hand-built payload) may omit them. The mapper is the
// only place that decides what "missing" means, so the rest of the UI can trust
// the model.
export function mapMe(dto: MeDto | undefined): CurrentUser | null {
  if (!dto || typeof dto.username !== "string") return null;
  return {
    username: dto.username,
    role: isUserRole(dto.role) ? dto.role : DEFAULT_ROLE,
    mustChangePassword: dto.mustChangePassword === true,
    totpEnabled: dto.totpEnabled === true,
  };
}

function challengeTokenOf(dto: Record<string, unknown>): string | null {
  if (dto.twoFactorRequired !== true) return null;
  return typeof dto.challengeToken === "string" && dto.challengeToken.length > 0
    ? dto.challengeToken
    : null;
}

// The login body is a union the generated SDK types loosely (MeDto | unknown),
// so the mapper is what distinguishes "signed in" from "2FA challenge" — and it
// refuses to invent a session for a payload that is neither.
export function mapLoginResult(dto: unknown): LoginResult | null {
  if (typeof dto !== "object" || dto === null) return null;
  const record = dto as Record<string, unknown>;
  const challengeToken = challengeTokenOf(record);
  if (challengeToken) return { kind: "challenge", challengeToken };
  const user = mapMe(record as MeDto);
  return user ? { kind: "session", user } : null;
}
