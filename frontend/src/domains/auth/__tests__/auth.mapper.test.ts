import { describe, expect, it } from "vitest";
import type { MeDto } from "@sdk";
import { mapLoginResult, mapMe } from "../auth.mapper";
import { canWriteRole, isAdminRole } from "../auth.model";

const meDto = (overrides: Partial<MeDto> = {}): MeDto => ({
  username: "alice",
  role: "ADMIN",
  mustChangePassword: false,
  totpEnabled: false,
  ...overrides,
});

describe("mapMe", () => {
  it("maps the username, role, forced-change flag and 2FA state", () => {
    expect(mapMe(meDto({ totpEnabled: true }))).toEqual({
      username: "alice",
      role: "ADMIN",
      mustChangePassword: false,
      totpEnabled: true,
    });
  });

  it("defaults missing totpEnabled to false", () => {
    const dto = { username: "alice", role: "VIEWER" } as unknown as MeDto;
    expect(mapMe(dto)?.totpEnabled).toBe(false);
    expect(mapMe(meDto({ totpEnabled: true }))?.totpEnabled).toBe(true);
  });

  it("maps the forced password change", () => {
    expect(
      mapMe(meDto({ role: "MEMBER", mustChangePassword: true }))
        ?.mustChangePassword,
    ).toBe(true);
  });

  it("defaults a missing role to MEMBER", () => {
    const dto = { username: "alice" } as unknown as MeDto;
    expect(mapMe(dto)?.role).toBe("MEMBER");
  });

  it("defaults an unknown role to MEMBER", () => {
    const dto = { username: "alice", role: "OWNER" } as unknown as MeDto;
    expect(mapMe(dto)?.role).toBe("MEMBER");
  });

  it("defaults missing mustChangePassword to false", () => {
    const dto = { username: "alice", role: "VIEWER" } as unknown as MeDto;
    expect(mapMe(dto)?.mustChangePassword).toBe(false);
  });

  it("maps a missing payload or username to null", () => {
    expect(mapMe(undefined)).toBeNull();
    expect(mapMe({} as MeDto)).toBeNull();
  });
});

describe("mapLoginResult", () => {
  it("maps a session payload", () => {
    expect(mapLoginResult(meDto({ totpEnabled: true }))).toEqual({
      kind: "session",
      user: {
        username: "alice",
        role: "ADMIN",
        mustChangePassword: false,
        totpEnabled: true,
      },
    });
  });

  it("maps a two-factor challenge", () => {
    expect(
      mapLoginResult({
        twoFactorRequired: true,
        challengeToken: "challenge-1",
      }),
    ).toEqual({ kind: "challenge", challengeToken: "challenge-1" });
  });

  it("refuses to invent a session for an unusable payload", () => {
    expect(mapLoginResult(undefined)).toBeNull();
    expect(mapLoginResult(null)).toBeNull();
    expect(mapLoginResult({})).toBeNull();
    expect(mapLoginResult({ twoFactorRequired: true })).toBeNull();
    expect(
      mapLoginResult({ twoFactorRequired: true, challengeToken: "" }),
    ).toBeNull();
  });
});

describe("role helpers", () => {
  it("only ADMIN is an admin role", () => {
    expect(isAdminRole("ADMIN")).toBe(true);
    expect(isAdminRole("MEMBER")).toBe(false);
    expect(isAdminRole("VIEWER")).toBe(false);
  });

  it("only VIEWER cannot write", () => {
    expect(canWriteRole("ADMIN")).toBe(true);
    expect(canWriteRole("MEMBER")).toBe(true);
    expect(canWriteRole("VIEWER")).toBe(false);
  });
});
