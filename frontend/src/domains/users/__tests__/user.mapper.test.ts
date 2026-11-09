import { describe, expect, it } from "vitest";
import type { UserDto } from "@sdk";
import {
  mapCreatedUser,
  mapResetPasswordResult,
  mapUser,
  mapUserInvitePreview,
  mapUsers,
  type UserSource,
} from "../user.mapper";

const userDto = (overrides: Partial<UserSource> = {}): UserSource => ({
  id: "u-1",
  username: "alice",
  role: "ADMIN",
  isActive: true,
  mustChangePassword: false,
  deactivatedAt: null,
  createdBy: "bootstrap",
  createdAt: "2026-10-20T10:00:00.000Z",
  ...overrides,
});

describe("mapUser", () => {
  it("maps every field", () => {
    expect(mapUser(userDto())).toEqual({
      id: "u-1",
      username: "alice",
      role: "ADMIN",
      isActive: true,
      mustChangePassword: false,
      deactivatedAt: null,
      createdBy: "bootstrap",
      createdAt: "2026-10-20T10:00:00.000Z",
    });
  });

  it("maps a deactivated account", () => {
    const user = mapUser(
      userDto({
        isActive: false,
        deactivatedAt: "2026-10-21T10:00:00.000Z",
        createdBy: null,
      }),
    );

    expect(user.isActive).toBe(false);
    expect(user.deactivatedAt).toBe("2026-10-21T10:00:00.000Z");
    expect(user.createdBy).toBeNull();
  });

  it("normalizes the free-form nullable columns", () => {
    const user = mapUser(
      userDto({
        deactivatedAt: { unexpected: true },
        createdBy: 7,
        // A direct (non-JSON) call hands a Date over for the date column.
        createdAt: new Date("2026-10-20T10:00:00.000Z") as unknown as string,
      }),
    );

    expect(user.deactivatedAt).toBeNull();
    expect(user.createdBy).toBeNull();
    expect(user.createdAt).toBe("2026-10-20T10:00:00.000Z");
  });

  it("defaults a missing role to MEMBER and treats only false as inactive", () => {
    const dto = {
      id: "u-2",
      username: "bob",
      createdAt: "2026-10-20T10:00:00.000Z",
    } as unknown as UserDto;

    expect(mapUser(dto).role).toBe("MEMBER");
    expect(mapUser(dto).isActive).toBe(true);
  });
});

describe("mapUsers", () => {
  it("maps an undefined list to an empty list", () => {
    expect(mapUsers(undefined)).toEqual([]);
  });

  it("preserves the server order", () => {
    expect(
      mapUsers([
        userDto({ id: "u-2", username: "bob" }) as unknown as UserDto,
        userDto() as unknown as UserDto,
      ]).map((user) => user.username),
    ).toEqual(["bob", "alice"]);
  });
});

describe("mapCreatedUser", () => {
  it("maps the user and the one-time link", () => {
    const created = mapCreatedUser({
      user: userDto({ username: "jane" }) as unknown as UserDto,
      invite: { token: "tok-1", expiresAt: "2026-11-16T10:00:00.000Z" },
    });

    expect(created).toEqual({
      user: expect.objectContaining({ username: "jane" }),
      invite: { token: "tok-1", expiresAt: "2026-11-16T10:00:00.000Z" },
    });
  });
});

describe("mapResetPasswordResult", () => {
  it("maps the replacement link", () => {
    expect(
      mapResetPasswordResult({
        invite: { token: "tok-2", expiresAt: "2026-11-16T10:00:00.000Z" },
      }),
    ).toEqual({
      invite: { token: "tok-2", expiresAt: "2026-11-16T10:00:00.000Z" },
    });
  });
});

describe("mapUserInvitePreview", () => {
  it("maps the preview the invite page renders", () => {
    expect(
      mapUserInvitePreview({
        username: "jane",
        role: "MEMBER",
        expiresAt: "2026-11-16T10:00:00.000Z",
        status: "pending",
      }),
    ).toEqual({
      username: "jane",
      role: "MEMBER",
      expiresAt: "2026-11-16T10:00:00.000Z",
      status: "pending",
    });
  });

  // A status this build does not know is treated as spent: offering a reveal
  // the API would refuse is worse than hiding the button.
  it("reads an unknown status as used", () => {
    expect(
      mapUserInvitePreview({
        username: "jane",
        role: "MEMBER",
        expiresAt: "2026-11-16T10:00:00.000Z",
        status: "revoked",
      } as unknown as Parameters<typeof mapUserInvitePreview>[0]).status,
    ).toBe("used");
  });
});
