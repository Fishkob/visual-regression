import { describe, it, expect, vi, beforeEach } from "vitest";
import type { RouteLocationNormalized } from "vue-router";
import { authGuard } from "@/lib/auth-guard";
import { queryClient } from "@/lib/query-client";

const mockMe = vi.hoisted(() => vi.fn());

vi.mock("@sdk", () => ({
  authControllerMe: (...args: unknown[]) => mockMe(...args),
}));

function toWith(meta: { requiresAuth?: boolean }): RouteLocationNormalized {
  return { meta } as RouteLocationNormalized;
}

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
    mockMe.mockResolvedValue({ data: { username: "alice" } });
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
});
