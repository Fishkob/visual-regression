export const WEBHOOK_MAX_ATTEMPTS = 5;

// Exponential-ish backoff between attempts: 1m, 5m, 30m, 2h. The fifth failure
// is terminal, so only four delays are needed.
const RETRY_DELAYS_MS = [60_000, 300_000, 1_800_000, 7_200_000];

export function nextAttemptAt(
  attempts: number,
  now: Date = new Date(),
): Date | null {
  if (attempts >= WEBHOOK_MAX_ATTEMPTS) return null;
  const delay = RETRY_DELAYS_MS[attempts - 1];
  return delay === undefined ? null : new Date(now.getTime() + delay);
}
