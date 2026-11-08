import { describe, expect, it } from "vitest";
import {
  mapRevokeAllResult,
  mapSession,
  mapSessions,
  type SessionSource,
} from "../security.mapper";

const sessionDto = (overrides: Partial<SessionSource> = {}): SessionSource => ({
  id: "s-1",
  createdAt: "2026-10-20T10:00:00.000Z",
  lastSeenAt: "2026-10-20T10:05:00.000Z",
  expiresAt: "2026-11-20T10:00:00.000Z",
  ip: "10.0.0.1",
  userAgent: "Mozilla/5.0 (X11; Linux x86_64)",
  isCurrent: true,
  ...overrides,
});

describe("mapSession", () => {
  it("maps every field", () => {
    expect(mapSession(sessionDto())).toEqual({
      id: "s-1",
      createdAt: "2026-10-20T10:00:00.000Z",
      lastSeenAt: "2026-10-20T10:05:00.000Z",
      expiresAt: "2026-11-20T10:00:00.000Z",
      ip: "10.0.0.1",
      userAgent: "Mozilla/5.0 (X11; Linux x86_64)",
      isCurrent: true,
    });
  });

  it("normalizes the free-form request metadata", () => {
    const session = mapSession(
      sessionDto({
        lastSeenAt: { unexpected: true },
        ip: 7,
        userAgent: "",
        isCurrent: false,
      }),
    );

    expect(session.lastSeenAt).toBeNull();
    expect(session.ip).toBeNull();
    expect(session.userAgent).toBeNull();
    expect(session.isCurrent).toBe(false);
  });

  it("accepts Date columns from a direct call", () => {
    const session = mapSession(
      sessionDto({
        createdAt: new Date("2026-10-20T10:00:00.000Z") as unknown as string,
        lastSeenAt: new Date("2026-10-20T10:05:00.000Z"),
      }),
    );

    expect(session.createdAt).toBe("2026-10-20T10:00:00.000Z");
    expect(session.lastSeenAt).toBe("2026-10-20T10:05:00.000Z");
  });

  it("maps a never-seen session", () => {
    expect(mapSession(sessionDto({ lastSeenAt: null })).lastSeenAt).toBeNull();
  });
});

describe("mapSessions", () => {
  it("maps an undefined list to an empty list", () => {
    expect(mapSessions(undefined)).toEqual([]);
  });

  it("preserves the server order", () => {
    expect(
      mapSessions([
        sessionDto({ id: "s-1", isCurrent: true }) as never,
        sessionDto({ id: "s-2" }) as never,
      ]).map((session) => session.id),
    ).toEqual(["s-1", "s-2"]);
  });
});

describe("mapRevokeAllResult", () => {
  it("reads the revoked count defensively", () => {
    expect(mapRevokeAllResult({ revoked: 2 })).toBe(2);
    expect(mapRevokeAllResult({ revoked: "2" })).toBe(0);
    expect(mapRevokeAllResult(undefined)).toBe(0);
    expect(mapRevokeAllResult(null)).toBe(0);
    expect(mapRevokeAllResult(3)).toBe(0);
  });
});
