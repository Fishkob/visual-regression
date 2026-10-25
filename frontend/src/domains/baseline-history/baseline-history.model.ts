// Why a baseline revision exists: the overwrite that replaced the recorded
// baseline (an approval, an earlier restore, or a future import).
export type BaselineRevisionReason = "approval" | "restore" | "import";

// One baseline that a later overwrite replaced. The variant dimensions are not
// repeated here — every revision of a history read belongs to the variant the
// read was scoped to.
export interface BaselineRevision {
  id: string;
  // Renderable URL: the presigned one, with the canonical URL as fallback.
  imageUrl: string;
  imageHash: string;
  pageCount?: number;
  pixelDiffThreshold: number;
  reason: BaselineRevisionReason;
  createdBy?: string;
  createdAt: string;
}
