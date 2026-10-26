// "What will actually happen to this project's evidence?" — the project's own
// override when it has one, the deployment default otherwise, in one place. The
// retention preview and the maintenance sweeps have to answer identically: an
// admin deciding whether to raise a limit is reading the sweeps' rule, not a
// second derivation of it.
//
// `0` is a value, not "unset": a project may keep no baseline revisions at all,
// so the fallback is nullish-coalescing rather than a falsy test.

export interface RetentionDefaults {
  baselineRevisionLimit: number;
  runHistoryDays: number;
  orphanGraceHours: number;
}

export interface RetentionOverrides {
  baselineRevisionLimit?: number | null;
  runHistoryDays?: number | null;
  orphanGraceHours?: number | null;
}

export interface EffectiveRetention {
  baselineRevisionLimit: number;
  runHistoryDays: number;
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
    orphanGraceHours: project.orphanGraceHours ?? defaults.orphanGraceHours,
  };
}
