/**
 * SDK Response Adapter
 *
 * Extracts the data payload from an SDK response. The generated fetch-based
 * client throws on failed requests and resolves with an object carrying a
 * `data` property on success — an empty 200 body resolves with `data: {}`.
 * This helper returns undefined only when the success payload has no `data`
 * member, so callers treat that case explicitly (the query/mutation seams
 * already do: queries map it, mutations reject it).
 */
export function getData<T>(result: unknown): T | undefined {
  if (typeof result === "object" && result && "data" in result) {
    return (result as { data: T }).data;
  }
  return undefined;
}

// Single home for reading the message out of an SDK error payload. The
// generated client resolves non-2xx as `{ error, request, response }`; the
// error member is a string (often) or an object carrying a `message`.
export function sdkErrorMessage(
  error: unknown,
  fallback = "Request failed",
): string {
  if (typeof error === "string") return error;
  if (typeof error === "object" && error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string") return message;
  }
  return fallback;
}

// The shared unwrap used by queries and mutations: mirrors getData but refuses
// to treat an SDK error response as data. The generated client runs with
// throwOnError off, so a non-2xx response resolves as `{ error, request,
// response }` instead of throwing — without this check it would flow through
// getData as undefined and map to an empty state rather than the error.
// A 200 empty body resolves as `{ data: {} }` (no `error` member) and keeps
// unwrapping normally.
export function unwrapSdkData<T>(
  response: unknown,
  fallbackMessage = "Request failed",
): T | undefined {
  if (typeof response === "object" && response && "error" in response) {
    throw new Error(
      sdkErrorMessage((response as { error: unknown }).error, fallbackMessage),
    );
  }
  return getData<T>(response);
}
