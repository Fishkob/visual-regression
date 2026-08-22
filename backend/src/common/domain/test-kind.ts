export type TestKind = 'image' | 'pdf';

export const TEST_KINDS: readonly TestKind[] = ['image', 'pdf'];

export const KIND_FILE_EXTENSIONS: Record<TestKind, string> = {
  image: 'png',
  pdf: 'pdf',
};

export const KIND_MIME_TYPES: Record<TestKind, string> = {
  image: 'image/png',
  pdf: 'application/pdf',
};
