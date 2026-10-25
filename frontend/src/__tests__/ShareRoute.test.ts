import { describe, it, expect } from "vitest";
import router from "@/router/index";

describe("share route", () => {
  it("resolves /share/:token as a public route", () => {
    const resolved = router.resolve("/share/tok-1");

    expect(resolved.name).toBe("share");
    expect(resolved.meta.requiresAuth).toBe(false);
  });
});
