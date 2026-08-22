let currentTraceId: string | null = null;
let errorQueue: Record<string, unknown>[] = [];

export function captureTraceIdFromHeaders(
  headers: Headers | undefined | null,
): void {
  if (!headers) return;
  const traceId = headers.get("x-trace-id");
  if (traceId) {
    currentTraceId = traceId;
  }
}

function sendError(payload: Record<string, unknown>): void {
  try {
    fetch("/api/v1/log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      keepalive: true,
    });
  } catch {
    errorQueue.push(payload);
  }
}

function flushErrorQueue(): void {
  while (errorQueue.length > 0) {
    const payload = errorQueue.shift();
    if (payload) sendError(payload);
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
  window.addEventListener("pagehide", () => flushErrorQueue());
}
