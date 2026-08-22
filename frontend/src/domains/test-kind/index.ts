// Single home for the test-kind vocabulary: "image" vs "pdf". The SDK types
// `kind` as a plain string, so every consumer that branches on kind crosses
// this seam instead of spelling the literals itself. A third kind is one edit
// here, not a hunt through the call sites.
export const IMAGE_TEST_KIND = "image" as const;
export const PDF_TEST_KIND = "pdf" as const;

export const TEST_KINDS = [IMAGE_TEST_KIND, PDF_TEST_KIND] as const;

export type TestKind = (typeof TEST_KINDS)[number];

export function isImageKind(kind: string | null | undefined): kind is "image" {
  return kind === IMAGE_TEST_KIND;
}

export function isPdfKind(kind: string | null | undefined): kind is "pdf" {
  return kind === PDF_TEST_KIND;
}

export function isTestKind(kind: string | null | undefined): kind is TestKind {
  return kind === IMAGE_TEST_KIND || kind === PDF_TEST_KIND;
}
