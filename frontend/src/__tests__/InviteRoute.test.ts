import { describe, it, expect } from "vitest";
import router from "@/router/index";

describe("invite route", () => {
  it("resolves /invite/:token as a public route", () => {
    const resolved = router.resolve("/invite/tok-1");

    expect(resolved.name).toBe("invite");
    expect(resolved.meta.requiresAuth).toBe(false);
  });
});
