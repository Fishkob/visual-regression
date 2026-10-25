import type { ApiKeyDto, CreatedApiKeyDto } from "@sdk";
import type { ApiKey, IssuedApiKey } from "./api-key.model";

export function mapApiKey(dto: ApiKeyDto): ApiKey {
  return {
    id: String(dto.id ?? ""),
    name: dto.name ?? "",
    keyHint: dto.keyHint ?? null,
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
    expiresAt: dto.expiresAt ?? null,
  };
}
