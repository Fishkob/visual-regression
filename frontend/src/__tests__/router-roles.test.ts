import { describe, it, expect } from "vitest";
import router from "@/router/index";

function metaOf(name: string) {
  return router.getRoutes().find((route) => route.name === name)?.meta;
}

describe("route role declarations", () => {
  it.each(["users", "api-keys", "audit", "project-webhooks"])(
    "protects %s with the ADMIN role",
    (name) => {
      expect(metaOf(name)?.requiresAuth).toBe(true);
      expect(metaOf(name)?.requiresRole).toBe("ADMIN");
    },
  );

  it("requires a session for the forced password change", () => {
    expect(metaOf("change-password")?.requiresAuth).toBe(true);
    expect(metaOf("change-password")?.requiresRole).toBeUndefined();
  });

  it("leaves the read pages open to every role", () => {
    for (const name of [
      "review-inbox",
      "project-runs",
      "run-detail",
      "project-trends",
      "security",
    ]) {
      expect(metaOf(name)?.requiresAuth).toBe(true);
      expect(metaOf(name)?.requiresRole).toBeUndefined();
    }
  });
});
