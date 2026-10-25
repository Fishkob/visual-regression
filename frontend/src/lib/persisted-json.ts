// Typed, failure-tolerant localStorage JSON. Storage can be unavailable (private
// mode, quota, disabled cookies) and a stored value can be corrupt, so every read
// validates through a caller-supplied parser and falls back to null instead of
// throwing into a component's setup.
export function readPersistedJson<T>(
  key: string,
  parse: (value: unknown) => T | null,
): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return null;
    return parse(JSON.parse(raw) as unknown);
  } catch {
    return null;
  }
}

export function writePersistedJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable or full: the feature degrades to in-memory state */
  }
}

export function removePersistedKey(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}
