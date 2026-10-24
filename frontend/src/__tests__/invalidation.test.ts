import { describe, expect, it, vi } from "vitest";
import {
  invalidatePdfTestDetails,
  invalidateProjectDetail,
  invalidateProjectList,
  invalidateProjectsForGroupChange,
  invalidateVisualTestDetails,
} from "@/lib/invalidation";

type MockClient = { invalidateQueries: ReturnType<typeof vi.fn> };

function createClient(): MockClient {
  return { invalidateQueries: vi.fn() };
}

function countRoot(client: MockClient, root: string): number {
  return client.invalidateQueries.mock.calls.filter((call) => {
    const options = call[0] as { queryKey?: readonly unknown[] };
    return options.queryKey?.[0] === root;
  }).length;
}

describe("invalidation", () => {
  it("invalidateProjectDetail does not invalidate the inbox", () => {
    const client = createClient();

    invalidateProjectDetail(client as never, "p");

    expect(countRoot(client, "review-inbox")).toBe(0);
    expect(countRoot(client, "projects")).toBe(1);
    expect(countRoot(client, "pending-tests")).toBe(1);
  });

  it("invalidateProjectList invalidates the inbox exactly once", () => {
    const client = createClient();

    invalidateProjectList(client as never);

    expect(countRoot(client, "review-inbox")).toBe(1);
    expect(countRoot(client, "projects")).toBe(1);
  });

  it("invalidateVisualTestDetails invalidates the inbox exactly once plus detail, variants and pending", () => {
    const client = createClient();

    invalidateVisualTestDetails(client as never, {
      projectName: "p",
      testName: "t",
      viewport: "v",
      browser: "b",
      environment: "e",
    });

    expect(countRoot(client, "review-inbox")).toBe(1);
    expect(countRoot(client, "visual-tests")).toBe(2);
    expect(countRoot(client, "projects")).toBe(2);
    expect(countRoot(client, "pending-tests")).toBe(1);
    expect(client.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["projects", "pending"],
    });
    expect(client.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["visual-tests", "variants"],
    });
  });

  it("invalidatePdfTestDetails leaves the visual variant gallery cache alone", () => {
    const client = createClient();

    invalidatePdfTestDetails(client as never, {
      projectName: "p",
      testName: "t",
      viewport: "v",
      browser: "b",
      environment: "e",
    });

    expect(countRoot(client, "visual-tests")).toBe(0);
    expect(countRoot(client, "pdf-tests")).toBe(1);
  });

  it("invalidateProjectsForGroupChange invalidates groups and the inbox exactly once", () => {
    const client = createClient();

    invalidateProjectsForGroupChange(client as never);

    expect(countRoot(client, "groups")).toBe(1);
    expect(countRoot(client, "review-inbox")).toBe(1);
  });
});
