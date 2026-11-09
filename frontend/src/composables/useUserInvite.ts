import {
  publicUserInviteControllerPreview,
  publicUserInviteControllerReveal,
  type InvitePreviewDto,
} from "@sdk";
import { getData, sdkErrorStatus } from "@/lib/sdk";
import { mapUserInvitePreview } from "@/domains/users/user.mapper";
import type { UserInvitePreview } from "@/domains/users/user.model";

// The invite link has no session behind it: the token in the URL is the whole
// credential, and the API answers "no such link" (404) and "already used"
// (410) as states of the page rather than as failures. Mapping them here keeps
// the SDK out of the view (ADR-009) — same shape as `usePublicShare`.
export type InvitePreviewResolution =
  | { kind: "found"; preview: UserInvitePreview }
  | { kind: "not-found" }
  | { kind: "error" };

export type InviteRevealResolution =
  | { kind: "revealed"; username: string; temporaryPassword: string }
  | { kind: "gone" }
  | { kind: "not-found" }
  | { kind: "error" };

// Reading the link must not use it up: chat clients and mail scanners fetch
// every URL they are shown, which is why the API splits preview from reveal.
export function useUserInvitePreview() {
  return async (token: string): Promise<InvitePreviewResolution> => {
    try {
      const response = await publicUserInviteControllerPreview({
        path: { token },
      });
      const status = sdkErrorStatus(response);
      if (status === 404) return { kind: "not-found" };
      if (status !== undefined) return { kind: "error" };
      const dto = getData<InvitePreviewDto>(response);
      return dto
        ? { kind: "found", preview: mapUserInvitePreview(dto) }
        : { kind: "error" };
    } catch {
      return { kind: "error" };
    }
  };
}

// Spends the link. A 410 means the reveal already happened (or the link
// expired) — the one case the page explains instead of reporting an error.
export function useUserInviteReveal() {
  return async (token: string): Promise<InviteRevealResolution> => {
    try {
      const response = await publicUserInviteControllerReveal({
        path: { token },
      });
      const status = sdkErrorStatus(response);
      if (status === 410) return { kind: "gone" };
      if (status === 404) return { kind: "not-found" };
      if (status !== undefined) return { kind: "error" };
      const dto = getData<{ username: string; temporaryPassword: string }>(
        response,
      );
      return dto?.temporaryPassword
        ? {
            kind: "revealed",
            username: dto.username,
            temporaryPassword: dto.temporaryPassword,
          }
        : { kind: "error" };
    } catch {
      return { kind: "error" };
    }
  };
}
