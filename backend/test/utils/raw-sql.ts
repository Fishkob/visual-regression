// `$queryRaw(Prisma.sql`…`)` hands the mock one Sql object whose `sql` getter
// renders the statement and whose `values` holds the binds. A tagged template
// passed straight through is a plain string, so both shapes are accepted.
export function sqlText(call: unknown[]): string {
  const [first] = call;
  if (typeof first === 'string') return first;
  return (first as { sql?: string } | undefined)?.sql ?? '';
}

export function sqlValues(call: unknown[]): unknown[] {
  return (call[0] as { values?: unknown[] } | undefined)?.values ?? [];
}
