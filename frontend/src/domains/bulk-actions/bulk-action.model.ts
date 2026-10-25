// One row of a bulk result. `success` mirrors the per-item verdict; a failure
// also carries the reason the single operation could not complete.
export interface BulkItemResult {
  id: string;
  success: boolean;
  error: string | null;
}

export interface BulkApproveResult {
  approved: BulkItemResult[];
  failed: BulkItemResult[];
}

export interface BulkMoveResult {
  moved: BulkItemResult[];
  failed: BulkItemResult[];
}

export interface BulkDeleteResult {
  deleted: BulkItemResult[];
  failed: BulkItemResult[];
}

// A bulk approval is sent once per project, so selecting rows across projects
// means one request per group. The inbox builds these selections from the rows.
export interface BulkApproveSelection {
  projectName: string;
  comparisonIds: string[];
}

// What a failure dialog renders: the stable id plus a human label captured
// before the mutation (the rows may leave the refreshed list afterwards).
export interface BulkFailureRow {
  id: string;
  label?: string;
  error: string;
}

function plural(count: number, singular: string, pluralForm: string): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

export function bulkApproveSummary(result: BulkApproveResult): string {
  const approved = plural(result.approved.length, "change", "changes");
  if (result.failed.length === 0) return `Approved ${approved}`;
  return `Approved ${approved}, ${result.failed.length} failed`;
}

export function bulkMoveSummary(result: BulkMoveResult): string {
  const moved = plural(result.moved.length, "project", "projects");
  if (result.failed.length === 0) return `Moved ${moved}`;
  return `Moved ${moved}, ${result.failed.length} failed`;
}

// Failure rows for the dialog: look up the label captured before the request so
// a refreshed inbox does not lose the test name that explains the error.
export function bulkFailureRows(
  failed: readonly BulkItemResult[],
  labels: ReadonlyMap<string, string>,
): BulkFailureRow[] {
  return failed.map((item) => {
    const label = labels.get(item.id);
    return {
      id: item.id,
      ...(label ? { label } : {}),
      error: item.error ?? "Unknown error",
    };
  });
}
