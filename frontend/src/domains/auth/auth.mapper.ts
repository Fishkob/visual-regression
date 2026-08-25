import type { MeDto } from "@sdk";
import type { CurrentUser } from "./auth.model";

export function mapMe(dto: MeDto | undefined): CurrentUser | null {
  if (!dto || typeof dto.username !== "string") return null;
  return { username: dto.username };
}
