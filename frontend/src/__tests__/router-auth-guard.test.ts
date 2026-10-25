import { describe, it, expect, vi, beforeEach } from "vitest";
import type { RouteLocationNormalized } from "vue-router";
import { authGuard } from "@/lib/auth-guard";
import { queryClient } from "@/lib/query-client";
import type { UserRole } from "@/domains/auth/auth.model";

const mockMe = vi.hoisted(() => vi.fn());

vi.mock("@sdk", () => ({
  authControllerMe: (...args: unknown[]) => mockMe(...args),
}));

function toWith(
  meta: { requiresAuth?: boolean; requiresRole?: UserRole },
  name: string | null = null,
): RouteLocationNormalized {
  return { meta, name } as RouteLocationNormalized;
}

const me = (overrides: Record<string, unknown> = {}) => ({
  data: {
    username: "alice",
    role: "MEMBER",
    mustChangePassword: false,
    ...overrides,
  },
});

describe("authGuard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queryClient.clear();
  });

  it("returns true for a public route (requiresAuth false)", async () => {
    await expect(authGuard(toWith({ requiresAuth: false }))).resolves.toBe(
      true,
    );
    expect(mockMe).not.toHaveBeenCalled();
  });

  it("returns true when /me resolves a valid user", async () => {
    mockMe.mockResolvedValue(me());
    await expect(authGuard(toWith({ requiresAuth: true }))).resolves.toBe(true);
  });

  it("returns { name: 'login' } when /me is unauthenticated", async () => {
    mockMe.mockResolvedValue({ error: { status: 401 } });
    await expect(authGuard(toWith({ requiresAuth: true }))).resolves.toEqual({
      name: "login",
    });
  });

  it("returns { name: 'login' } when /me throws", async () => {
    mockMe.mockRejectedValue(new Error("network error"));
    await expect(authGuard(toWith({ requiresAuth: true }))).resolves.toEqual({
      name: "login",
    });
  });

  describe("forced password change", () => {
    it("redirects every other page to change-password", async () => {
      mockMe.mockResolvedValue(me({ mustChangePassword: true }));
      await expect(
        authGuard(toWith({ requiresAuth: true }, "review-inbox")),
      ).resolves.toEqual({ name: "change-password" });
    });

    it("allows the change-password page itself", async () => {
      mockMe.mockResolvedValue(me({ mustChangePassword: true }));
      await expect(
        authGuard(toWith({ requiresAuth: true }, "change-password")),
      ).resolves.toBe(true);
    });

    it("allows the login page so the user can switch accounts", async () => {
      mockMe.mockResolvedValue(me({ mustChangePassword: true }));
      await expect(
        authGuard(toWith({ requiresAuth: false }, "login")),
      ).resolves.toBe(true);
    });

    it("lets a user with a chosen password through", async () => {
      mockMe.mockResolvedValue(me({ mustChangePassword: false }));
      await expect(
        authGuard(toWith({ requiresAuth: true }, "review-inbox")),
      ).resolves.toBe(true);
    });
  });

  describe("role-protected routes", () => {
    it("lets an ADMIN onto an admin page", async () => {
      mockMe.mockResolvedValue(me({ role: "ADMIN" }));
      await expect(
        authGuard(
          toWith({ requiresAuth: true, requiresRole: "ADMIN" }, "users"),
        ),
      ).resolves.toBe(true);
    });

    it("sends a MEMBER to the forbidden page", async () => {
      mockMe.mockResolvedValue(me({ role: "MEMBER" }));
      await expect(
        authGuard(
          toWith({ requiresAuth: true, requiresRole: "ADMIN" }, "users"),
        ),
      ).resolves.toEqual({ name: "forbidden" });
    });

    it("sends a VIEWER to the forbidden page", async () => {
      mockMe.mockResolvedValue(me({ role: "VIEWER" }));
      await expect(
        authGuard(
          toWith({ requiresAuth: true, requiresRole: "ADMIN" }, "api-keys"),
        ),
      ).resolves.toEqual({ name: "forbidden" });
    });

    it("checks the role after the forced password change", async () => {
      mockMe.mockResolvedValue(
        me({ role: "MEMBER", mustChangePassword: true }),
      );
      await expect(
        authGuard(
          toWith({ requiresAuth: true, requiresRole: "ADMIN" }, "users"),
        ),
      ).resolves.toEqual({ name: "change-password" });
    });
  });
});
