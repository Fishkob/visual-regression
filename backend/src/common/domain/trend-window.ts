// The trends endpoint clamps the window it serves, so this is the oldest outcome
// history any read path can ask for. `OUTCOME_RETENTION_DEFAULT_DAYS` is derived
// from it on purpose: the sweep's default must never prune a row the endpoint
// still serves, and deriving makes a raised clamp raise the default with it
// (ADR-079).
export const MAX_TREND_WINDOW_DAYS = 365;

// The clamp plus a month of slack, so the default window never straddles the
// boundary a deployment is still reading.
export const OUTCOME_RETENTION_DEFAULT_DAYS = MAX_TREND_WINDOW_DAYS + 35;
