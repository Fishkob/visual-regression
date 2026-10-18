const COLOR_PREFIXES = [
  "bg",
  "text",
  "border",
  "border-x",
  "border-y",
  "border-t",
  "border-r",
  "border-b",
  "border-l",
  "border-s",
  "border-e",
  "ring",
  "ring-offset",
  "inset-ring",
  "outline",
  "fill",
  "stroke",
  "shadow",
  "inset-shadow",
  "text-shadow",
  "from",
  "via",
  "to",
  "divide",
  "divide-x",
  "divide-y",
  "decoration",
  "accent",
  "caret",
] as const;

const PALETTE_NAMES = [
  "white",
  "black",
  "slate",
  "gray",
  "zinc",
  "neutral",
  "stone",
  "red",
  "orange",
  "amber",
  "yellow",
  "lime",
  "green",
  "emerald",
  "teal",
  "cyan",
  "sky",
  "blue",
  "indigo",
  "violet",
  "purple",
  "fuchsia",
  "pink",
  "rose",
] as const;

const CHROMATIC_NAMES = PALETTE_NAMES.filter(
  (name) => name !== "white" && name !== "black",
).join("|");
const SHADE = "(?:50|[1-9]00|950)";
const NUMERIC_OPACITY = "(?:100|[1-9]?\\d)";
const OPACITY = `(?:${NUMERIC_OPACITY}|\\[[^\\]]+\\])`;
const PREFIX = `(?:${COLOR_PREFIXES.join("|")})`;

const PALETTE_UTILITY = new RegExp(
  `^${PREFIX}-(?:(?:white|black)(?:/${OPACITY})?|(?:${CHROMATIC_NAMES})-${SHADE}(?:/${OPACITY})?)$`,
);

const ARBITRARY_UTILITY = new RegExp(
  `^${PREFIX}-\\[([^\\]]+)\\](?:/${OPACITY})?$`,
);

const COLOR_MARKER =
  /(?:^|[^a-zA-Z0-9-])(?:#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b|rgba?\(|hsla?\(|hwb\(|oklch\(|oklab\(|lab\(|lch\(|color\(|color-mix\()/;

function stripVariants(part: string): string {
  let depth = 0;
  let lastColon = -1;
  for (let index = 0; index < part.length; index += 1) {
    const char = part[index];
    if (char === "[") depth += 1;
    else if (char === "]") depth -= 1;
    else if (char === ":" && depth === 0) lastColon = index;
  }
  return part.slice(lastColon + 1);
}

function normalizeUtility(part: string): string {
  return stripVariants(part).replace(/^!+/, "").replace(/!+$/, "");
}

// Accepts a whitespace-separated blob. Variants are removed (respecting
// bracket nesting), important markers are stripped, then palette utilities and
// arbitrary bracket values containing CSS colour functions/hex values match.
export function findRawColorUtilities(value: string): string[] {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .filter((part) => {
      const utility = normalizeUtility(part);
      const arbitrary = ARBITRARY_UTILITY.exec(utility);
      if (arbitrary) {
        const withoutUrls = arbitrary[1].replace(/url\([^)]*\)/gi, " ");
        return COLOR_MARKER.test(withoutUrls);
      }
      return PALETTE_UTILITY.test(utility);
    });
}
