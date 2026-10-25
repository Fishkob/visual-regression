import { describe, expect, it } from "vitest";
import {
  mapApiKey,
  mapApiKeys,
  mapIssuedApiKey,
  type ApiKeySource,
  type CreatedApiKeySource,
} from "../api-key.mapper";

const apiKeyDto = (overrides: Partial<ApiKeySource> = {}): ApiKeySource => ({
  id: "k1",
  name: "ci-upload",
  keyHint: "7f3a",
  ownerId: "u-1",
  ownerUsername: "alice",
  scopes: ["upload", "read"],
  projectNames: ["checkout-ui"],
  createdBy: "alice",
  createdAt: "2026-10-20T10:00:00.000Z",
  lastUsedAt: null,
  expiresAt: null,
  revokedAt: null,
  revokedReason: null,
  replacedById: null,
  status: "active",
  ...overrides,
});

describe("api key mapper", () => {
  it("maps an active key", () => {
    expect(mapApiKey(apiKeyDto())).toEqual({
      id: "k1",
      name: "ci-upload",
      keyHint: "7f3a",
      ownerUsername: "alice",
      scopes: ["upload", "read"],
      projectNames: ["checkout-ui"],
      createdBy: "alice",
      createdAt: "2026-10-20T10:00:00.000Z",
      lastUsedAt: null,
      expiresAt: null,
      revokedAt: null,
      revokedReason: null,
      replacedById: null,
      status: "active",
    });
  });

  it("keeps the revoked audit fields", () => {
    const mapped = mapApiKey(
      apiKeyDto({
        status: "revoked",
        revokedAt: "2026-11-01T10:00:00.000Z",
        revokedReason: "leaked",
        replacedById: "k2",
      }),
    );

    expect(mapped.status).toBe("revoked");
    expect(mapped.revokedReason).toBe("leaked");
    expect(mapped.replacedById).toBe("k2");
  });

  it("defaults a key with no scopes to upload-only and no allowlist", () => {
    const mapped = mapApiKey(
      apiKeyDto({
        ownerUsername: null,
        scopes: [],
        projectNames: undefined as unknown as string[],
      }),
    );

    expect(mapped.ownerUsername).toBeNull();
    expect(mapped.scopes).toEqual(["upload"]);
    expect(mapped.projectNames).toEqual([]);
  });

  it("drops unknown scopes and duplicate project names", () => {
    const mapped = mapApiKey(
      apiKeyDto({
        scopes: ["upload", "superuser", "read", "upload"] as never,
        projectNames: ["checkout-ui", "", "checkout-ui", "admin-ui"],
      }),
    );

    expect(mapped.scopes).toEqual(["upload", "read"]);
    expect(mapped.projectNames).toEqual(["checkout-ui", "admin-ui"]);
  });

  it("flattens the doubled project array the OpenAPI schema declares", () => {
    const mapped = mapApiKey(
      apiKeyDto({
        projectNames: [["checkout-ui"], ["admin-ui"]] as unknown as string[],
      }),
    );

    expect(mapped.projectNames).toEqual(["checkout-ui", "admin-ui"]);
  });

  it("tolerates missing optional columns", () => {
    const mapped = mapApiKey(
      apiKeyDto({
        keyHint: undefined as unknown as null,
        createdBy: undefined as unknown as null,
        lastUsedAt: undefined as unknown as null,
      }),
    );

    expect(mapped.keyHint).toBeNull();
    expect(mapped.createdBy).toBeNull();
    expect(mapped.lastUsedAt).toBeNull();
  });

  it("maps an undefined list to an empty list", () => {
    expect(mapApiKeys(undefined)).toEqual([]);
  });

  it("maps the create-once response", () => {
    const created: CreatedApiKeySource = {
      id: "k1",
      name: "ci-upload",
      rawKey: "raw-secret",
      keyHint: "7f3a",
      scopes: ["upload"],
      projectNames: [],
      expiresAt: null,
    };

    expect(mapIssuedApiKey(created)).toEqual({
      id: "k1",
      name: "ci-upload",
      rawKey: "raw-secret",
      keyHint: "7f3a",
      scopes: ["upload"],
      projectNames: [],
      expiresAt: null,
    });
  });
});
