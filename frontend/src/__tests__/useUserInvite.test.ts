import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  useUserInvitePreview,
  useUserInviteReveal,
} from "@/composables/useUserInvite";

const { mockPreview, mockReveal } = vi.hoisted(() => ({
  mockPreview: vi.fn(),
  mockReveal: vi.fn(),
}));

vi.mock("@sdk", () => ({
  publicUserInviteControllerPreview: (...args: unknown[]) =>
    mockPreview(...args),
  publicUserInviteControllerReveal: (...args: unknown[]) => mockReveal(...args),
}));

function statusResponse(status: number) {
  return { error: { message: "nope" }, response: { status } };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("useUserInvitePreview", () => {
  it("resolves the preview the page renders", async () => {
    mockPreview.mockResolvedValue({
      data: {
        username: "jane",
        role: "MEMBER",
        expiresAt: "2026-11-16T10:00:00.000Z",
        status: "pending",
      },
    });

    await expect(useUserInvitePreview()("tok-1")).resolves.toEqual({
      kind: "found",
      preview: {
        username: "jane",
        role: "MEMBER",
        expiresAt: "2026-11-16T10:00:00.000Z",
        status: "pending",
      },
    });
    expect(mockPreview).toHaveBeenCalledWith({ path: { token: "tok-1" } });
  });

  it("reports a token no invite carries as not found", async () => {
    mockPreview.mockResolvedValue(statusResponse(404));

    await expect(useUserInvitePreview()("tok-1")).resolves.toEqual({
      kind: "not-found",
    });
  });

  it("reports any other status as a failure", async () => {
    mockPreview.mockResolvedValue(statusResponse(500));

    await expect(useUserInvitePreview()("tok-1")).resolves.toEqual({
      kind: "error",
    });
  });

  it("reports an empty success body as a failure", async () => {
    mockPreview.mockResolvedValue({ data: undefined });

    await expect(useUserInvitePreview()("tok-1")).resolves.toEqual({
      kind: "error",
    });
  });

  it("reports a thrown request as a failure", async () => {
    mockPreview.mockRejectedValue(new Error("offline"));

    await expect(useUserInvitePreview()("tok-1")).resolves.toEqual({
      kind: "error",
    });
  });
});

describe("useUserInviteReveal", () => {
  it("hands back the password the link carries", async () => {
    mockReveal.mockResolvedValue({
      data: { username: "jane", temporaryPassword: "temp-pass-1" },
    });

    await expect(useUserInviteReveal()("tok-1")).resolves.toEqual({
      kind: "revealed",
      username: "jane",
      temporaryPassword: "temp-pass-1",
    });
    expect(mockReveal).toHaveBeenCalledWith({ path: { token: "tok-1" } });
  });

  it("reports a spent link as gone", async () => {
    mockReveal.mockResolvedValue(statusResponse(410));

    await expect(useUserInviteReveal()("tok-1")).resolves.toEqual({
      kind: "gone",
    });
  });

  it("reports a replaced link as not found", async () => {
    mockReveal.mockResolvedValue(statusResponse(404));

    await expect(useUserInviteReveal()("tok-1")).resolves.toEqual({
      kind: "not-found",
    });
  });

  it("reports any other status as a failure", async () => {
    mockReveal.mockResolvedValue(statusResponse(500));

    await expect(useUserInviteReveal()("tok-1")).resolves.toEqual({
      kind: "error",
    });
  });

  // A success without a password would render an empty block; treating it as a
  // failure keeps the reveal button available instead.
  it("reports a success without a password as a failure", async () => {
    mockReveal.mockResolvedValue({ data: { username: "jane" } });

    await expect(useUserInviteReveal()("tok-1")).resolves.toEqual({
      kind: "error",
    });
  });

  it("reports a thrown request as a failure", async () => {
    mockReveal.mockRejectedValue(new Error("offline"));

    await expect(useUserInviteReveal()("tok-1")).resolves.toEqual({
      kind: "error",
    });
  });
});
