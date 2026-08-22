export type ErrorSender = (payload: Record<string, unknown>) => void;

let currentTraceId: string | null = null;
let errorQueue: Record<string, unknown>[] = [];

function defaultSender(payload: Record<string, unknown>): void {
  fetch("/api/v1/log", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    keepalive: true,
  });
}

// The sender is injectable so the retry/flush policy is testable through this
// module's own interface instead of hard-wiring global fetch. Production keeps
// the default fetch sender; tests substitute a fake.
let sender: ErrorSender = defaultSender;

export function setErrorSender(next: ErrorSender): void {
  sender = next;
}

function sendError(payload: Record<string, unknown>): void {
  try {
    sender(payload);
  } catch {
    errorQueue.push(payload);
  }
}

// Explicit drain for queued payloads (a send threw). A failure during the
// drain re-queues and stops, so a persistently failing sender neither loses
// payloads nor spins forever; the next drain retries.
export function drainErrorQueue(): void {
  while (errorQueue.length > 0) {
    const payload = errorQueue.shift();
    if (payload) {
      try {
        sender(payload);
      } catch {
        errorQueue.push(payload);
        return;
      }
    }
  }
}

export function captureTraceIdFromHeaders(
  headers: Headers | undefined | null,
): void {
  if (!headers) return;
  const traceId = headers.get("x-trace-id");
  if (traceId) {
    currentTraceId = traceId;
  }
}

export function reportError(
  error: unknown,
  context?: Record<string, unknown>,
): void {
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : undefined;

  const payload = {
    timestamp: new Date().toISOString(),
    traceId: currentTraceId,
    message,
    stack,
    url: window.location.href,
    userAgent: navigator.userAgent,
    ...context,
  };

  if (import.meta.env.DEV) {
    console.error("[Observability]", payload);
  }

  sendError(payload);
}

export function initObservability(client: {
  interceptors: {
    response: {
      use: (fn: (response: Response) => Response | Promise<Response>) => number;
    };
  };
}): void {
  client.interceptors.response.use((response: Response) => {
    captureTraceIdFromHeaders(response.headers);
    return response;
  });
  window.addEventListener("pagehide", () => drainErrorQueue());
}
