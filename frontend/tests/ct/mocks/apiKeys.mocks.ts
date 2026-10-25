export const API_KEYS_RESPONSE = {
  status: 200,
  contentType: "application/json",
  body: JSON.stringify([
    {
      id: "k2",
      name: "design-review",
      keyHint: "ab12",
      createdBy: "alice",
      createdAt: "2026-10-20T10:00:00.000Z",
      lastUsedAt: null,
      expiresAt: null,
      revokedAt: null,
      revokedReason: null,
      replacedById: null,
      status: "active",
    },
    {
      id: "k1",
      name: "ci-upload",
      keyHint: "7f3a",
      createdBy: "alice",
      createdAt: "2026-09-01T10:00:00.000Z",
      lastUsedAt: "2026-10-25T10:00:00.000Z",
      expiresAt: null,
      revokedAt: null,
      revokedReason: null,
      replacedById: null,
      status: "active",
    },
    {
      id: "k3",
      name: "release-check",
      keyHint: "sD-o",
      createdBy: "alice",
      createdAt: "2026-10-01T10:00:00.000Z",
      lastUsedAt: "2026-10-24T10:00:00.000Z",
      expiresAt: "2026-10-26T10:00:00.000Z",
      revokedAt: null,
      revokedReason: "rotated",
      replacedById: "k1",
      status: "active",
    },
    {
      id: "k0",
      name: "retired-ci",
      keyHint: "cf99",
      createdBy: "alice",
      createdAt: "2026-08-01T10:00:00.000Z",
      lastUsedAt: "2026-09-01T10:00:00.000Z",
      expiresAt: null,
      revokedAt: "2026-09-02T10:00:00.000Z",
      revokedReason: "rotated",
      replacedById: "k1",
      status: "revoked",
    },
  ]),
};

export const API_KEYS_EMPTY_RESPONSE = {
  status: 200,
  contentType: "application/json",
  body: JSON.stringify([]),
};

export const CREATED_API_KEY_RESPONSE = {
  status: 201,
  contentType: "application/json",
  body: JSON.stringify({
    id: "k3",
    name: "nightly",
    rawKey: "raw-secret-value-7f3a",
    keyHint: "7f3a",
    expiresAt: null,
  }),
};

export const ROTATED_API_KEY_RESPONSE = {
  status: 201,
  contentType: "application/json",
  body: JSON.stringify({
    id: "k4",
    name: "ci-upload",
    rawKey: "rotated-secret-value-ab12",
    keyHint: "ab12",
    expiresAt: null,
  }),
};

export const REVOKED_API_KEY_RESPONSE = {
  status: 200,
  contentType: "application/json",
  body: JSON.stringify({
    id: "k2",
    name: "design-review",
    keyHint: "ab12",
    createdBy: "alice",
    createdAt: "2026-10-20T10:00:00.000Z",
    lastUsedAt: null,
    expiresAt: null,
    revokedAt: "2026-10-26T10:00:00.000Z",
    revokedReason: "leaked",
    replacedById: null,
    status: "revoked",
  }),
};
