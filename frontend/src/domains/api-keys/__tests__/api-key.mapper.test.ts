import { describe, expect, it } from "vitest";
import type { ApiKeyDto, CreatedApiKeyDto } from "@sdk";
import { mapApiKey, mapApiKeys, mapIssuedApiKey } from "../api-key.mapper";

const apiKeyDto = (overrides: Partial<ApiKeyDto> = {}): ApiKeyDto => ({
  id: "k1",
  name: "ci-upload",
  keyHint: "7f3a",
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
    const created: CreatedApiKeyDto = {
      id: "k1",
      name: "ci-upload",
      rawKey: "raw-secret",
      keyHint: "7f3a",
      expiresAt: null,
    };

    expect(mapIssuedApiKey(created)).toEqual({
      id: "k1",
      name: "ci-upload",
      rawKey: "raw-secret",
      keyHint: "7f3a",
      expiresAt: null,
    });
  });
});
