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
