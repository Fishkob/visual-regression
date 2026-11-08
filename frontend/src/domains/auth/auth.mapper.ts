import type { MeDto } from "@sdk";
import { DEFAULT_ROLE, isUserRole, type CurrentUser } from "./auth.model";

// The generated MeDto types role/mustChangePassword as required, but an older
// backend (or a hand-built payload) may omit them. The mapper is the only place
// that decides what "missing" means, so the rest of the UI can trust the model.
export function mapMe(dto: MeDto | undefined): CurrentUser | null {
  if (!dto || typeof dto.username !== "string") return null;
  return {
    username: dto.username,
    role: isUserRole(dto.role) ? dto.role : DEFAULT_ROLE,
    mustChangePassword: dto.mustChangePassword === true,
  };
}
