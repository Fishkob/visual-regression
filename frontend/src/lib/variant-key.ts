export type VariantParams = {
  viewport?: string;
  browser?: string;
  environment?: string;
};

export type KeyParams = VariantParams & { name?: string };

type VariantDtoShape =
  | {
      viewport?: string;
      browser?: string;
      environment?: string;
    }
  | null
  | undefined;

export function variantFromDto(dto: VariantDtoShape): VariantParams {
  return {
    viewport: dto?.viewport,
    browser: dto?.browser,
    environment: dto?.environment,
  };
}

export function variantKeyParts(
  filters?: VariantParams,
): [string, string, string] {
  return [
    filters?.viewport ?? "",
    filters?.browser ?? "",
    filters?.environment ?? "",
  ];
}

// The one identity derivation: the tuple parts are the source of truth and the
// string key is joined from them, so the seen-set membership and the cache-key
// parts can never disagree on a dimension.
export function keyOf(test: KeyParams): string {
  return [test.name ?? "", ...variantKeyParts(test)].join("__");
}

// The comparison-panel remount key: a project/test/variant/comparison identity
// plus a per-kind artifact URL (diff image or diff PDF). Lives here so the
// reviewable-details page stops hand-joining a second identity rule that could
// drift from keyOf on a new dimension. `::` is a deliberate separator choice —
// it cannot collide with `__` keys or URL content.
export function viewKeyOf(args: {
  projectName: string;
  testName: string;
  filters?: VariantParams;
  comparison?: { id?: string } | null;
  artifactUrl: string;
}): string {
  return [
    args.projectName,
    args.testName,
    ...variantKeyParts(args.filters),
    args.comparison?.id ?? "",
    args.artifactUrl,
  ].join("::");
}
