import { describe, expect, it } from "vitest";
import type { MeDto } from "@sdk";
import { mapMe } from "../auth.mapper";
import { canWriteRole, isAdminRole } from "../auth.model";

const meDto = (overrides: Partial<MeDto> = {}): MeDto => ({
  username: "alice",
  role: "ADMIN",
  mustChangePassword: false,
  seesAllProjects: false,
  teams: [],
  ...overrides,
});

describe("mapMe", () => {
  it("maps the username, role, forced-change flag and teams", () => {
    expect(mapMe(meDto())).toEqual({
      username: "alice",
      role: "ADMIN",
      mustChangePassword: false,
      seesAllProjects: false,
      teams: [],
    });
  });

  it("reads the all-projects flag as a boolean, not as truthiness", () => {
    const truthyWire = {
      ...meDto(),
      seesAllProjects: "yes",
    } as unknown as MeDto;
    const absent = {
      ...meDto(),
      seesAllProjects: undefined,
    } as unknown as MeDto;

    expect(mapMe(truthyWire)?.seesAllProjects).toBe(false);
    expect(mapMe(absent)?.seesAllProjects).toBe(false);
    expect(mapMe(meDto({ seesAllProjects: true }))?.seesAllProjects).toBe(true);
  });

  it("keeps the teams the caller belongs to", () => {
    const mapped = mapMe(
      meDto({ teams: [{ id: "t-1", name: "Checkout" }] as never }),
    );

    expect(mapped?.teams).toEqual([{ id: "t-1", name: "Checkout" }]);
  });

  it("drops a malformed team instead of rendering an empty name", () => {
    const dto = {
      username: "alice",
      teams: [{ id: "t-1" }, { id: "t-2", name: "Platform" }],
    } as unknown as MeDto;

    expect(mapMe(dto)?.teams).toEqual([{ id: "t-2", name: "Platform" }]);
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
