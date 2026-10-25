import type { TestMetadataDto } from "@sdk";
import type { TestFlake, TestMetadata } from "./test-metadata.model";

// The generated spec double-nests tags (`Array<Array<string>>`, the same Swagger
// `type: [String], isArray: true` quirk as recovery codes) while the backend
// sends a flat string[]. The source widens the editable columns and the mapper
// flattens/normalizes them into the model.
export type TestMetadataSource = Omit<
  TestMetadataDto,
  "tags" | "description" | "mutedUntil" | "muteReason"
> & {
  tags?: unknown;
  description?: unknown;
  mutedUntil?: unknown;
  muteReason?: unknown;
};

function presentString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

// The wire carries ISO strings; a `Date` is accepted too because the backend DTO
// declares these columns as dates and a direct (non-JSON) call would hand one
// over.
function presentIso(value: unknown): string | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }
  return presentString(value);
}

function toCount(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function presentTags(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(
      (value as unknown[])
        .flatMap((entry) =>
          Array.isArray(entry) ? (entry as unknown[]) : [entry],
        )
        .filter(
          (tag): tag is string => typeof tag === "string" && tag.length > 0,
        ),
    ),
  ];
}

function mapFlake(dto: TestMetadataDto["flake"] | undefined): TestFlake {
  return {
    transitions: toCount(dto?.transitions),
    changed: toCount(dto?.changed),
    clean: toCount(dto?.clean),
  };
}

// Undefined stays undefined so a query can tell "not loaded yet" from real
// metadata; every present payload gets defensive defaults instead of nulls.
export function mapTestMetadata(
  dto: TestMetadataSource | undefined,
): TestMetadata | undefined {
  if (!dto) return undefined;
  return {
    id: String(dto.id ?? ""),
    name: dto.name ?? "",
    description: presentString(dto.description),
    tags: presentTags(dto.tags),
    mutedUntil: presentIso(dto.mutedUntil),
    muteReason: presentString(dto.muteReason),
    isMuted: dto.isMuted === true,
    flake: mapFlake(dto.flake),
  };
}
