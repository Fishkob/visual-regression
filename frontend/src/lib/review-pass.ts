// The review-pass protocol, one owner for both halves of the seam:
//  - the skip-memory seen-set (keyed by project, module-scoped so it survives
//    component unmounts without leaking across projects or sessions), and
//  - the fresh/continued-pass rule, which rides history.state on loop
//    navigations so a direct entry (deep link, refresh, back-navigation) starts
//    a fresh pass instead of inheriting skip-marks — see CONTEXT.md.
// useReviewSession (the pass loop) and useTestNavigation (the loop's navigator)
// both compose this module instead of coordinating through each other.
const reviewSeenByProject = new Map<string, Set<string>>();

// History state written by loop navigations so the destination can tell
// "continued a pass" (keep skip-memory) from "entered directly" (fresh pass).
export const REVIEW_LOOP_NAV_STATE = { fromReviewLoop: true } as const;

export function resetReviewSeen(projectName?: string): void {
  if (projectName) {
    reviewSeenByProject.delete(projectName);
  } else {
    reviewSeenByProject.clear();
  }
}

function seenForProject(projectName: string): Set<string> {
  let seen = reviewSeenByProject.get(projectName);
  if (!seen) {
    seen = new Set<string>();
    reviewSeenByProject.set(projectName, seen);
  }
  return seen;
}

export function markSeen(projectName: string, key: string): void {
  seenForProject(projectName).add(key);
}

export function isSeen(projectName: string, key: string): boolean {
  return seenForProject(projectName).has(key);
}

export function isFromReviewLoopNavigation(): boolean {
  return window.history.state?.fromReviewLoop === true;
}

// The fresh/continued-pass rule, one owner: a pass entered directly (deep
// link, refresh, back-navigation) resets the project's skip-memory; only a
// loop-marked navigation continues an existing pass. useReviewSession composes
// this instead of re-encoding the rule at its call site.
export function beginPassForProject(projectName: string): void {
  if (!isFromReviewLoopNavigation()) {
    resetReviewSeen(projectName);
  }
}
