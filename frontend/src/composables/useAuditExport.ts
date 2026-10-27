import { auditControllerExport } from "@sdk";
import type { AuditFilters } from "@/domains/audit/audit-event.model";
import { unwrapSdkData } from "@/lib/sdk";

// The export is a command, not reactive state: the view keeps the button state
// and the toast, this keeps the SDK contract (ADR-009: views never import
// @sdk). It returns the CSV text so the caller decides what to do with it.
export function useAuditExport() {
  return async (filters: AuditFilters): Promise<string> => {
    const response = await auditControllerExport({
      query: {
        ...(filters.actor ? { actor: filters.actor } : {}),
        ...(filters.action ? { action: filters.action } : {}),
        ...(filters.projectName ? { projectName: filters.projectName } : {}),
        ...(filters.from ? { from: filters.from } : {}),
        ...(filters.to ? { to: filters.to } : {}),
      },
      parseAs: "text",
    });
    const csv = unwrapSdkData<string>(response);
    if (typeof csv !== "string") {
      throw new Error("The audit export came back empty");
    }
    return csv;
  };
}
