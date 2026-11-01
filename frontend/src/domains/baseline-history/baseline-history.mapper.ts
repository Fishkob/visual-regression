import type { BaselineRevisionDto } from "@sdk";
import type { BaselineRevision } from "./baseline-history.model";

// The generated DTO now types `pageCount` and `createdBy` correctly
// (`number | null` / `string | null`); the backend DTO carries `type: Number` /
// `type: String` for them, which the OpenAPI plugin needs to emit a type at all.
// The source keeps the generated fields but widens those two to `unknown`: the
// mapper is the seam that normalizes a wire value in either spelling (a `Date`,
// a numeric string, an absent key) to one absent value, and the fixtures type
// themselves against this tolerant input rather than a type they would have to
// cast into.
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
