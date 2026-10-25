// PNG signature (8 bytes) + IHDR chunk length/type (8 bytes) + width/height
// (8 bytes) are enough to bound the decoded buffer without decoding it.
const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);
const PNG_HEADER_BYTES = 24;
const IHDR_LENGTH = 13;
const IHDR_TYPE = 'IHDR';

export function isPngSignature(buffer: Buffer): boolean {
  return (
    buffer.length >= PNG_SIGNATURE.length &&
    buffer.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)
  );
}

export function readPngDimensions(
  buffer: Buffer,
): { width: number; height: number } | null {
  if (buffer.length < PNG_HEADER_BYTES || !isPngSignature(buffer)) {
    return null;
  }
  if (
    buffer.readUInt32BE(8) !== IHDR_LENGTH ||
    buffer.toString('ascii', 12, 16) !== IHDR_TYPE
  ) {
    return null;
  }
  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  if (width === 0 || height === 0) {
    return null;
  }
  return { width, height };
}
