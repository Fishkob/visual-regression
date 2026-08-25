import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleUnauthorized } from "@/lib/auth-redirect";

const { clearMock, pushMock, currentRoute } = vi.hoisted(() => ({
  clearMock: vi.fn(),
  pushMock: vi.fn(),
  currentRoute: { value: { name: "login" } },
}));

vi.mock("@/router/index", () => ({
  default: {
    currentRoute,
    push: pushMock,
  },
}));

vi.mock("@/lib/query-client", () => ({
  queryClient: { clear: clearMock },
}));

describe("handleUnauthorized", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    pushMock.mockReturnValue(Promise.resolve());
    currentRoute.value = { name: "login" };
  });

  it("does nothing when already on the login route", () => {
    handleUnauthorized();
    expect(clearMock).not.toHaveBeenCalled();
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("clears the query cache and redirects to login from a protected route", async () => {
    currentRoute.value = { name: "project-list" };
    handleUnauthorized();
    expect(clearMock).toHaveBeenCalledTimes(1);
    expect(pushMock).toHaveBeenCalledWith({ name: "login" });
    await Promise.resolve();
  });
});
