import type { ApiKeyDto, CreatedApiKeyDto } from "@sdk";
import {
  DEFAULT_API_KEY_SCOPES,
  isApiKeyScope,
  type ApiKey,
  type ApiKeyScope,
  type IssuedApiKey,
} from "./api-key.model";

// The generated DTO declares scopes/projectNames, but an older row or a
// hand-built payload may omit them: the mapper is the only place that decides
// what "missing" means (upload-only, every project), so the UI can trust the
// model instead of re-defaulting per component.
function presentScopes(value: unknown): ApiKeyScope[] {
  const scopes = Array.isArray(value) ? value.filter(isApiKeyScope) : [];
  // A key with no scopes could not do anything; treat it as the default.
  return scopes.length > 0 ? [...new Set(scopes)] : [...DEFAULT_API_KEY_SCOPES];
}

function presentProjectNames(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(
      value.filter(
        (name): name is string => typeof name === "string" && name.length > 0,
      ),
    ),
  ];
}

export function mapApiKey(dto: ApiKeyDto): ApiKey {
  return {
    id: String(dto.id ?? ""),
    name: dto.name ?? "",
    keyHint: dto.keyHint ?? null,
    ownerUsername: dto.ownerUsername ?? null,
    scopes: presentScopes(dto.scopes),
    projectNames: presentProjectNames(dto.projectNames),
    createdBy: dto.createdBy ?? null,
    createdAt: dto.createdAt ?? "",
    lastUsedAt: dto.lastUsedAt ?? null,
    expiresAt: dto.expiresAt ?? null,
    revokedAt: dto.revokedAt ?? null,
    revokedReason: dto.revokedReason ?? null,
    replacedById: dto.replacedById ?? null,
    status: dto.status ?? "active",
  };
}

export function mapApiKeys(dtos: ApiKeyDto[] | undefined = []): ApiKey[] {
  return dtos.map(mapApiKey);
}

export function mapIssuedApiKey(dto: CreatedApiKeyDto): IssuedApiKey {
  return {
    id: String(dto.id ?? ""),
    name: dto.name ?? "",
    rawKey: dto.rawKey ?? "",
    keyHint: dto.keyHint ?? "",
    scopes: presentScopes(dto.scopes),
    projectNames: presentProjectNames(dto.projectNames),
    expiresAt: dto.expiresAt ?? null,
  };
}
