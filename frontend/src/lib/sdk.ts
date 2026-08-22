/**
 * SDK Response Adapter
 *
 * Extracts the data payload from an SDK response. The generated SDK client
 * (Axios-based) returns AxiosResponse objects on success and AxiosError on
 * failure, both with a `data` property.  This helper returns undefined if the
 * request failed or returned no data.  Callers are responsible for handling
 * the undefined case appropriately (null checks, assertions, etc.)
 */
export function getData<T>(result: unknown): T | undefined {
  if (typeof result === "object" && result && "data" in result) {
    return (result as { data: T }).data;
  }
  return undefined;
}
