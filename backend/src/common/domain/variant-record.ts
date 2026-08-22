export interface VariantRecord {
  viewport: string;
  browser: string;
  environment: string;
}

// The VariantRecord shape as it must appear inside JSON payloads (job data,
// event payloads). Prisma's InputJsonValue requires an object with an index
// signature, which named interfaces do not carry — so payload types derive this
// instead of re-declaring the three fields. A field added to VariantRecord
// flows through here, and the explicit index signature satisfies Prisma while
// string values stay assignable to InputJsonValue.
export type VariantJson = VariantRecord & Record<string, string>;
