import { reactive } from "vue";

// The review-pass protocol, one owner for both halves of the seam:
//  - the skip-memory seen-set (keyed by project, module-scoped so it survives
//    component unmounts without leaking across projects or sessions), and
//  - the fresh/continued-pass rule, which rides history.state on loop
//    navigations so a direct entry starts a fresh pass instead of inheriting
//    skip-marks — see CONTEXT.md.
// useReviewSession (the pass loop) and useTestNavigation (the loop's navigator)
// both compose this module instead of coordinating through each other.
const reviewSeenByProject = new Map<string, Set<string>>();

interface PassProgress {
  current: number;
  total: number;
}

const passProgressByProject = reactive(new Map<string, PassProgress>());

// History state written by loop navigations so the destination can tell
// "continued a pass" (keep skip-memory) from "entered directly" (fresh pass).
export const REVIEW_LOOP_NAV_STATE = { fromReviewLoop: true } as const;

export function resetReviewSeen(projectName?: string): void {
  if (projectName) {
    reviewSeenByProject.delete(projectName);
    passProgressByProject.delete(projectName);
  } else {
    reviewSeenByProject.clear();
    passProgressByProject.clear();
  }
}

export function beginPassProgress(projectName: string, total: number): void {
  const existing = passProgressByProject.get(projectName);
  const fresh = !isFromReviewLoopNavigation();
  if (fresh || !existing) {
    passProgressByProject.set(projectName, { current: 1, total });
    return;
  }
  if (existing.total === 0 && total > 0) {
    existing.total = total;
  }
}

export function setPassTotal(projectName: string, total: number): void {
  const existing = passProgressByProject.get(projectName);
  if (!existing) return;
  if (existing.total === 0 && total > 0) existing.total = total;
}

export function advancePassProgress(projectName: string): void {
  const existing = passProgressByProject.get(projectName);
  if (existing) existing.current += 1;
}

export function getPassProgress(projectName: string): PassProgress {
  const p = passProgressByProject.get(projectName);
  if (!p) return { current: 1, total: 0 };
  return {
    current: p.total > 0 ? Math.min(p.current, p.total) : p.current,
    total: p.total,
  };
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

// The fresh/continued-pass rule, one owner. A pass is fresh (skip-memory reset)
// whenever the current history entry carries no loop mark — a table click or a
// typed deep link. A loop-marked entry continues the pass; because the mark
// rides the entry itself:
//  - back-navigation restores the entry's mark, so a reviewer stepping back
//    stays in the pass and already-skipped tests are not re-offered; and
//  - a full page refresh keeps the mark too, which is moot: the in-memory
//    seen-set is re-instantiated empty on reload, so the pass starts fresh
//    anyway.
// useReviewSession composes this instead of re-encoding the rule at its call
// site.
export function beginPassForProject(projectName: string): void {
  if (!isFromReviewLoopNavigation()) {
    resetReviewSeen(projectName);
  }
}

// The history-state payload for a same-test navigation (a variant switch on the
// details page). It carries the current entry's pass mark so switching variants
// keeps that entry inside the pass instead of turning it into a fresh-pass
// entry; outside a pass it stays undefined and the navigation is unmarked.
// One owner for the mark, as with the navigator and the pass rule above.
export function passMarkState(): typeof REVIEW_LOOP_NAV_STATE | undefined {
  return isFromReviewLoopNavigation() ? REVIEW_LOOP_NAV_STATE : undefined;
}
