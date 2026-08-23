import { describe, expect, it } from "vitest";
import { TEST_ID } from "@/lib/test-ids";

describe("TEST_ID", () => {
  it("exposes every test-id as a kebab-case value", () => {
    for (const [key, value] of Object.entries(TEST_ID)) {
      expect(key).toMatch(/^[a-z][a-zA-Z0-9]*$/);
      expect(value).toMatch(/^[a-z0-9-]+$/);
    }
  });

  it("has no duplicate values", () => {
    const values = Object.values(TEST_ID);
    expect(new Set(values).size).toBe(values.length);
  });
});
