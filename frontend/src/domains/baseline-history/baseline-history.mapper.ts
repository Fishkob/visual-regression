import type { BaselineRevisionDto } from "@sdk";
import type { BaselineRevision } from "./baseline-history.model";

// The generated DTO types `pageCount` and `createdBy` as free-form objects: the
// backend declares both nullable but untyped, so the OpenAPI spec gives the
// client `{ [key: string]: unknown } | null` where the wire carries
// `number | null` and `string | null`. The source keeps the generated fields but
// widens those two to `unknown`, so the mapper accepts the SDK type as-is and
// still normalizes both spellings to one absent value.
export type BaselineRevisionSource = Omit<
  BaselineRevisionDto,
  "pageCount" | "createdBy"
> & {
  pageCount?: unknown;
  createdBy?: unknown;
};

function presentNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function presentString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function renderableUrl(signed: string | undefined, canonical: string): string {
  return signed || canonical;
}

export function mapBaselineRevision(
  dto: BaselineRevisionSource,
): BaselineRevision {
  const pageCount = presentNumber(dto.pageCount);
  const createdBy = presentString(dto.createdBy);

  return {
    id: dto.id,
    imageUrl: renderableUrl(dto.signedImageUrl, dto.imageUrl),
    imageHash: dto.imageHash,
    pixelDiffThreshold: dto.pixelDiffThreshold,
    reason: dto.reason,
    createdAt: dto.createdAt,
    ...(pageCount !== undefined ? { pageCount } : {}),
    ...(createdBy !== undefined ? { createdBy } : {}),
  };
}

// The endpoint returns the newest revisions first, so the array order is the
// wire order: mapping preserves it and the panel reads it as history.
export function mapBaselineHistory(
  dtos: BaselineRevisionSource[] | null | undefined,
): BaselineRevision[] {
  return (dtos ?? []).map(mapBaselineRevision);
}
