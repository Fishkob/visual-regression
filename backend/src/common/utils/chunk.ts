// Splits a list into fixed-size batches. Used wherever a list of ids or URLs
// becomes an `IN (...)` clause: Postgres rejects a statement with more than
// 65535 bind parameters, and a single clause with tens of thousands of values is
// slow even below that limit.
const DEFAULT_CHUNK_SIZE = 1000;

export function chunk<T>(
  items: readonly T[],
  size: number = DEFAULT_CHUNK_SIZE,
): T[][] {
  if (items.length === 0) return [];
  const chunks: T[][] = [];
  for (let start = 0; start < items.length; start += size) {
    chunks.push(items.slice(start, start + size));
  }
  return chunks;
}
