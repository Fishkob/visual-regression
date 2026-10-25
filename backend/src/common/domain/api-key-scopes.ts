export const API_KEY_SCOPES = ['upload', 'read', 'approve', 'admin'] as const;

export type ApiKeyScope = (typeof API_KEY_SCOPES)[number];

// A CI key gets the narrowest useful scope: upload plus its own job status.
// Reading the rest of the API is opt-in, approval/admin never default.
export const DEFAULT_API_KEY_SCOPES: ApiKeyScope[] = ['upload'];
