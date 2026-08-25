export const RATE_LIMIT_WINDOW_MS = 60_000;

export function computeWindowStart(now: number): Date {
  return new Date(
    Math.floor(now / RATE_LIMIT_WINDOW_MS) * RATE_LIMIT_WINDOW_MS,
  );
}

export function retryAfterSeconds(now: number): number {
  return Math.max(
    1,
    Math.ceil((RATE_LIMIT_WINDOW_MS - (now % RATE_LIMIT_WINDOW_MS)) / 1000),
  );
}
