export interface TestFlake {
  transitions: number;
  changed: number;
  clean: number;
}

// The lifecycle metadata of one test on one branch: the editable rename/tags/
// mute fields plus the derived flake counter. Muted tests leave the inbox until
// the mute expires; the backend still keeps their history.
export interface TestMetadata {
  id: string;
  name: string;
  description: string | null;
  tags: string[];
  mutedUntil: string | null;
  muteReason: string | null;
  isMuted: boolean;
  flake: TestFlake;
}

// Only the fields a caller wants to change are sent; an omitted field stays as
// it is. `mutedUntil: null` clears the mute.
export interface UpdateTestMetadataInput {
  name?: string;
  description?: string | null;
  tags?: string[];
  mutedUntil?: string | null;
  muteReason?: string | null;
}

export const EMPTY_TEST_FLAKE: TestFlake = {
  transitions: 0,
  changed: 0,
  clean: 0,
};

// The text the header badge shows. The window matches the backend's flake
// computation (30 days of comparison outcomes).
export function testFlakeLabel(flake: TestFlake): string {
  return `${flake.transitions} transitions in 30 days`;
}

// Tags are entered comma-separated; the backend stores them normalized to
// lowercase, so the form normalizes too instead of round-tripping a visibly
// different list after saving.
export function parseTags(value: string): string[] {
  return [
    ...new Set(
      value
        .split(",")
        .map((tag) => tag.trim().toLowerCase())
        .filter((tag) => tag.length > 0),
    ),
  ];
}

export function formatTags(tags: readonly string[]): string {
  return tags.join(", ");
}
