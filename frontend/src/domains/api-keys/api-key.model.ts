export type ApiKeyStatus = "active" | "revoked" | "expired";

// The permission vocabulary of a key. A key defaults to upload-only; every
// additional scope is opt-in, and `admin` is the only one that reaches the
// administrative surface (projects deletion, users, keys, webhooks).
export const API_KEY_SCOPES = ["upload", "read", "approve", "admin"] as const;

export type ApiKeyScope = (typeof API_KEY_SCOPES)[number];

export const DEFAULT_API_KEY_SCOPES: ApiKeyScope[] = ["upload"];

export const API_KEY_SCOPE_DESCRIPTION: Record<ApiKeyScope, string> = {
  upload: "Upload captures and read the job status of those uploads.",
  read: "Read projects, runs, trends and audit data.",
  approve: "Approve changes and restore baselines.",
  admin: "Manage projects, users, keys and webhooks — can delete projects.",
};

export function isApiKeyScope(value: unknown): value is ApiKeyScope {
  return API_KEY_SCOPES.some((scope) => scope === value);
}

export interface ApiKey {
  id: string;
  name: string;
  keyHint: string | null;
  ownerUsername: string | null;
  scopes: ApiKeyScope[];
  // Empty means every project; a non-empty list confines the key.
  projectNames: string[];
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
  scopes: ApiKeyScope[];
  projectNames: string[];
  expiresAt: string | null;
}

export interface CreateApiKeyInput {
  name: string;
  expiresInDays?: number;
  scopes?: ApiKeyScope[];
  projectNames?: string[];
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
