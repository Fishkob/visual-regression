// "What will actually happen to this project's evidence?" — the project's own
// override when it has one, the deployment default otherwise, in one place. The
// retention preview and the maintenance sweeps have to answer identically: an
// admin deciding whether to raise a limit is reading the sweeps' rule, not a
// second derivation of it.
//
// `0` is a value, not "unset": a project may keep no baseline revisions at all,
// so the fallback is nullish-coalescing rather than a falsy test. For the two
// day windows `0` means "off" — a branch sweep that ran with 0 days would delete
// every branch the first night.
//
// `branchRetentionDays` is the one window that deletes a whole subtree (a
// branch and its tests, comparisons and runs), so it is opt-in: the deployment
// default is 0 and only a deployment or a project that raises it gets a sweep.

export interface RetentionDefaults {
  baselineRevisionLimit: number;
  runHistoryDays: number;
  branchRetentionDays: number;
  orphanGraceHours: number;
}

export interface RetentionOverrides {
  baselineRevisionLimit?: number | null;
  runHistoryDays?: number | null;
  branchRetentionDays?: number | null;
  orphanGraceHours?: number | null;
}

export interface EffectiveRetention {
  baselineRevisionLimit: number;
  runHistoryDays: number;
  branchRetentionDays: number;
  orphanGraceHours: number;
}

export function resolveRetention(
  project: RetentionOverrides,
  defaults: RetentionDefaults,
): EffectiveRetention {
  return {
    baselineRevisionLimit:
      project.baselineRevisionLimit ?? defaults.baselineRevisionLimit,
    runHistoryDays: project.runHistoryDays ?? defaults.runHistoryDays,
    branchRetentionDays:
      project.branchRetentionDays ?? defaults.branchRetentionDays,
    orphanGraceHours: project.orphanGraceHours ?? defaults.orphanGraceHours,
  };
}
