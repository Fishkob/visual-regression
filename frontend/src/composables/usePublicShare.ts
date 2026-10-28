import { publicShareControllerResolve, type PublicShareDto } from "@sdk";
import { getData } from "@/lib/sdk";
import {
  mapPublicShare,
  type PublicShareSource,
} from "@/domains/share-links/share-link.mapper";
import type { PublicShare } from "@/domains/share-links/share-link.model";

// The public resolve endpoint answers three ways that the read-only page has to
// tell apart: the payload, "passphrase required" (403) and "link gone" (404).
// Keeping that mapping here means the view does not import the SDK itself
// (ADR-009).
export type PublicShareResolution =
  | { kind: "resolved"; share: PublicShare }
  | { kind: "passphrase-required" }
  | { kind: "not-found" }
  | { kind: "error" };

// A successful SDK call also carries the raw Response (status 201), so the
// presence of `response` alone says nothing. Only the error envelope — which
// has an `error` member — decides passphrase/not-found.
function isErrorResponse(response: unknown): boolean {
  return (
    typeof response === "object" &&
    response !== null &&
    "error" in response &&
    (response as { error?: unknown }).error !== undefined
  );
}

function responseStatus(response: unknown): number | undefined {
  if (!isErrorResponse(response)) return undefined;
  const candidate = response as { response?: { status?: unknown } };
  const status = candidate.response?.status;
  return typeof status === "number" ? status : undefined;
}

export function usePublicShare() {
  return async (
    token: string,
    passphrase?: string,
  ): Promise<PublicShareResolution> => {
    try {
      const response = await publicShareControllerResolve({
        path: { token },
        body: passphrase ? { passphrase } : {},
      });
      const status = responseStatus(response);
      if (status === 403) return { kind: "passphrase-required" };
      if (status === 404) return { kind: "not-found" };
      if (status !== undefined) return { kind: "error" };
      const mapped = mapPublicShare(
        getData<PublicShareDto>(response) as PublicShareSource | undefined,
      );
      return mapped ? { kind: "resolved", share: mapped } : { kind: "error" };
    } catch {
      return { kind: "error" };
    }
  };
}
