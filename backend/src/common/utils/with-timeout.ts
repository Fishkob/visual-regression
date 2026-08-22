export function withTimeout<T>(
  work: Promise<T>,
  timeoutMs: number,
  errorFactory: () => Error,
  onTimeout?: () => void,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((resolve, reject) => {
    timer = setTimeout(() => {
      onTimeout?.();
      reject(errorFactory());
    }, timeoutMs);
  });
  // The losing promise must never surface an unhandled rejection: when the
  // timeout fires, callers abort the underlying work (e.g. destroying a MinIO
  // stream), which makes that work's promise reject after the race already
  // settled on the timeout. Marking it handled keeps the abort from turning
  // into an unhandled rejection.
  work.catch(() => undefined);
  return Promise.race([work, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}
