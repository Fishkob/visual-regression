import type { VariantParams } from "./variant-key";

export function formatVariantLabel(
  params: VariantParams,
  separator = " / ",
): string {
  return [params.viewport, params.browser, params.environment]
    .filter(Boolean)
    .join(separator);
}

export function formatVariantLabelWithName(
  name: string,
  params: VariantParams,
): string {
  const details = formatVariantLabel(params, " \u00b7 ");
  return details ? `${name} (${details})` : name;
}
