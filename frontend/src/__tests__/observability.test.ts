import { describe, it, expect, vi, beforeEach } from "vitest";

describe("observability", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  async function loadObservability() {
    return await import("@/lib/observability");
  }

  it("sends immediately when the sender succeeds", async () => {
    const sender = vi.fn();
    const { reportError, setErrorSender } = await loadObservability();
    setErrorSender(sender);

    reportError(new Error("boom"));

    expect(sender).toHaveBeenCalledTimes(1);
    const payload = sender.mock.calls[0][0] as Record<string, unknown>;
    expect(payload.message).toBe("boom");
  });

  it("queues a failed send and flushes it on the next drain", async () => {
    const sender = vi.fn();
    const { reportError, setErrorSender, drainErrorQueue } =
      await loadObservability();
    setErrorSender(sender);
    sender.mockImplementationOnce(() => {
      throw new Error("network down");
    });

    reportError(new Error("boom"));

    expect(sender).toHaveBeenCalledTimes(1);

    drainErrorQueue();

    expect(sender).toHaveBeenCalledTimes(2);
  });

  it("re-queues and stops draining while the sender still fails (no loss, no loop)", async () => {
    const sender = vi.fn();
    sender.mockImplementation(() => {
      throw new Error("network down");
    });
    const { reportError, setErrorSender, drainErrorQueue } =
      await loadObservability();
    setErrorSender(sender);

    reportError(new Error("first"));
    reportError(new Error("second"));

    drainErrorQueue();

    expect(sender).toHaveBeenCalledTimes(3);

    sender.mockImplementation(() => {});
    drainErrorQueue();

    expect(sender).toHaveBeenCalledTimes(5);
  });

  it("attaches the trace id captured from response headers", async () => {
    const sender = vi.fn();
    const { reportError, setErrorSender, captureTraceIdFromHeaders } =
      await loadObservability();
    setErrorSender(sender);

    captureTraceIdFromHeaders(new Headers({ "x-trace-id": "trace-123" }));
    reportError(new Error("boom"));

    expect((sender.mock.calls[0][0] as Record<string, unknown>).traceId).toBe(
      "trace-123",
    );
  });

  it("includes the message, stack, and context in the payload", async () => {
    const sender = vi.fn();
    const { reportError, setErrorSender } = await loadObservability();
    setErrorSender(sender);

    reportError(new Error("boom"), { testName: "login" });

    const payload = sender.mock.calls[0][0] as Record<string, unknown>;
    expect(payload.message).toBe("boom");
    expect(payload.stack).toContain("Error: boom");
    expect(payload.testName).toBe("login");
    expect(payload.url).toBe(window.location.href);
  });
});
