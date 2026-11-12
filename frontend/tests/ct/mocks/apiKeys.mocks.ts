import type { ApiKeysControllerCreateResponses } from "@sdk/models/ApiKeysControllerCreateResponses.gen";
import type { ApiKeysControllerFindAllResponses } from "@sdk/models/ApiKeysControllerFindAllResponses.gen";
import type { ApiKeysControllerRevokeResponses } from "@sdk/models/ApiKeysControllerRevokeResponses.gen";
import type { ApiKeysControllerRotateResponses } from "@sdk/models/ApiKeysControllerRotateResponses.gen";

export const API_KEYS_RESPONSE = {
  status: 200,
  contentType: "application/json",
  body: JSON.stringify([
    {
      id: "k2",
      name: "design-review",
      keyHint: "ab12",
      ownerId: "u-1",
      ownerUsername: "alice",
      scopes: ["upload"],
      projectNames: [],
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
      ownerId: "u-1",
      ownerUsername: "alice",
      scopes: ["upload", "read"],
      projectNames: ["checkout-ui"],
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
      ownerId: "u-2",
      ownerUsername: "bob",
      scopes: ["upload", "approve"],
      projectNames: ["checkout-ui", "admin-ui"],
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
      ownerId: null,
      ownerUsername: null,
      scopes: ["admin"],
      projectNames: [],
      createdBy: "alice",
      createdAt: "2026-08-01T10:00:00.000Z",
      lastUsedAt: "2026-09-01T10:00:00.000Z",
      expiresAt: null,
      revokedAt: "2026-09-02T10:00:00.000Z",
      revokedReason: "rotated",
      replacedById: "k1",
      status: "revoked",
    },
  ] satisfies ApiKeysControllerFindAllResponses[200]),
};

export const API_KEYS_EMPTY_RESPONSE = {
  status: 200,
  contentType: "application/json",
  body: JSON.stringify([] satisfies ApiKeysControllerFindAllResponses[200]),
};

export const CREATED_API_KEY_RESPONSE = {
  status: 201,
  contentType: "application/json",
  body: JSON.stringify({
    id: "k3",
    name: "nightly",
    rawKey: "raw-secret-value-7f3a",
    keyHint: "7f3a",
    scopes: ["upload"],
    projectNames: [],
    expiresAt: null,
  } satisfies ApiKeysControllerCreateResponses[201]),
};

// A rotation answers with the successor's raw key exactly once, the same shape
// as creation; the UI must hand it to the reveal dialog.
export const ROTATED_API_KEY_RESPONSE = {
  status: 201,
  contentType: "application/json",
  body: JSON.stringify({
    id: "k5",
    name: "ci-upload",
    rawKey: "rotated-secret-value-9c1d",
    keyHint: "9c1d",
    scopes: ["upload", "read"],
    projectNames: ["checkout-ui"],
    expiresAt: null,
  } satisfies ApiKeysControllerRotateResponses[201]),
};

// Revocation keeps the row and its reason; the list then renders it as revoked.
export const REVOKED_API_KEY_RESPONSE = {
  status: 200,
  contentType: "application/json",
  body: JSON.stringify({
    id: "k1",
    name: "ci-upload",
    keyHint: "7f3a",
    ownerId: "u-1",
    ownerUsername: "alice",
    scopes: ["upload", "read"],
    projectNames: ["checkout-ui"],
    createdBy: "alice",
    createdAt: "2026-09-01T10:00:00.000Z",
    lastUsedAt: "2026-10-25T10:00:00.000Z",
    expiresAt: null,
    revokedAt: "2026-11-12T09:00:00.000Z",
    revokedReason: "compromised in CI",
    replacedById: null,
    status: "revoked",
  } satisfies ApiKeysControllerRevokeResponses[200]),
};
