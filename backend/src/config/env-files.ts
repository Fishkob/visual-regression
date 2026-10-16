// Ordered by precedence: the first file that defines a variable wins, and a
// variable already present in the process environment wins over all of them.
export const ENV_FILES = ['.env.local', '.env'] as const;
