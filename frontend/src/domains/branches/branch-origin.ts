/**
 * Where a test's effective row comes from in a branch view.
 *
 * - `branch` — the row is materialised on the branch being viewed.
 * - `inherited` — the row belongs to an ancestor branch and the branch has not
 *   materialised its own copy yet; mutations are refused (409).
 *
 * One owner for the vocabulary: the read models and the read-only gating share
 * this type instead of re-inlining the union, so a third origin value cannot
 * silently fall through every `=== "inherited"` check as "editable".
 */
export type BranchOrigin = "branch" | "inherited";

export function isInheritedOrigin(origin: BranchOrigin | undefined): boolean {
  return origin === "inherited";
}
