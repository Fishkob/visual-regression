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
import { translateMessage as tm } from "@/lib/i18n-messages";

// A `reason` refines the coarse `code` the API sends (DomainError on the
// backend) and is the only error detail a client can act on: the message is
// prose and stays English even in a German UI. A value this client does not
// know falls through to the message, so a newer backend cannot break an older
// bundle.
const ERROR_REASON_KEYS: Record<string, string> = {
  branch_archived: "errorReasons.branchArchived",
  branch_target_conflict: "errorReasons.branchTargetConflict",
  comparison_not_pending: "errorReasons.comparisonNotPending",
  comparison_superseded: "errorReasons.comparisonSuperseded",
  test_inherited: "errorReasons.testInherited",
};

export function sdkErrorReason(error: unknown): string | undefined {
  if (typeof error === "object" && error) {
    const reason = (error as { reason?: unknown }).reason;
    if (typeof reason === "string") return reason;
  }
  return undefined;
}

export function sdkErrorMessage(
  error: unknown,
  fallback = tm("common.requestFailed"),
): string {
  const reasonKey = ERROR_REASON_KEYS[sdkErrorReason(error) ?? ""];
  if (reasonKey) return tm(reasonKey);
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
  fallbackMessage = tm("common.requestFailed"),
): T | undefined {
  if (typeof response === "object" && response && "error" in response) {
    throw new Error(
      sdkErrorMessage((response as { error: unknown }).error, fallbackMessage),
    );
  }
  return getData<T>(response);
}

// The status of an SDK error envelope, or undefined when the call did not fail.
// The public surface (share links, invite links) answers 403/404/410 as *states
// of the page* — "passphrase required", "link gone" — so the caller needs the
// number, not the message. A success response also carries `response`, which is
// why the error member decides.
export function sdkErrorStatus(response: unknown): number | undefined {
  if (typeof response !== "object" || response === null) return undefined;
  if (!("error" in response)) return undefined;
  if ((response as { error?: unknown }).error === undefined) return undefined;
  const status = (response as { response?: { status?: unknown } }).response
    ?.status;
  return typeof status === "number" ? status : undefined;
}
