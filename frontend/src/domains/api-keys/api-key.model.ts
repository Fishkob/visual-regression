export type ApiKeyStatus = "active" | "revoked" | "expired";

export interface ApiKey {
  id: string;
  name: string;
  keyHint: string | null;
  createdBy: string | null;
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  revokedReason: string | null;
  replacedById: string | null;
  status: ApiKeyStatus;
}

/** The create-once response: the raw key is never returned again. */
export interface IssuedApiKey {
  id: string;
  name: string;
  rawKey: string;
  keyHint: string;
  expiresAt: string | null;
}

export interface CreateApiKeyInput {
  name: string;
  expiresInDays?: number;
}

export interface RotateApiKeyInput {
  graceMinutes?: number;
  /** Omitted inherits the previous key's remaining lifetime; null means never. */
  expiresInDays?: number | null;
}

export interface RevokeApiKeyInput {
  reason?: string;
}

export const API_KEY_STATUS_LABEL: Record<ApiKeyStatus, string> = {
  active: "Active",
  revoked: "Revoked",
  expired: "Expired",
};
