import type { TestKind } from '@common/domain/test-kind';
import type { VariantJson } from '@common/domain/variant-record';

// Derives its variant shape from VariantRecord (via VariantJson), so adding a
// dimension to VariantRecord flows through here. VariantJson exists because
// Prisma's InputJsonValue needs an index signature that a named interface alone
// does not carry.
export interface JobData {
  testKind: TestKind;
  testId: string;
  testName?: string;
  sizePolicy?: 'FAIL' | 'PAD' | 'CROP' | 'RESIZE';
  runId?: string;
  runKey?: string;
  candidateHash: string;
  baseline: { id: string; url: string };
  candidate: { id: string; url: string };
  variant: VariantJson;
  traceContext?: Record<string, string>;
}
