import { RATE_LIMIT_WINDOW_MS } from '@internal/rate-limit/rate-limit-window';

// The limiter counts into the wall-clock minute: `computeWindowStart` floors
// `Date.now()` to a multiple of the window, so a burst that crosses `:00` loses
// its counter and the 429 the spec expects comes back as the endpoint's normal
// status (401 for the login spec, 201 for the upload one). Waiting only when the
// remaining window is too short for the burst keeps the common case at zero cost
// and turns a once-every-few-runs flake into a deterministic pass.
export async function ensureRateLimitWindowRoom(
  minWindowMs = 10_000,
): Promise<void> {
  const msLeft = RATE_LIMIT_WINDOW_MS - (Date.now() % RATE_LIMIT_WINDOW_MS);
  if (msLeft < minWindowMs) {
    await new Promise((resolve) => setTimeout(resolve, msLeft + 100));
  }
}
