import { plainToInstance } from 'class-transformer';
import type { ApprovalAuditRecord } from '@public/visualTest/core/infrastructure/repositories/approval-audit.repository';
import { ApprovalDto } from '@public/visualTest/review/presentation/dto/approval.dto';

// Explicit projection from the audit row to the API shape: the persisted
// variant columns become one nested `variant`, and every field is named here so
// a future column cannot leak into the response by default.
export function mapApprovalToDto(record: ApprovalAuditRecord): ApprovalDto {
  return plainToInstance(
    ApprovalDto,
    {
      id: record.id,
      approvedBy: record.approvedBy,
      approvedAt: record.approvedAt,
      comparisonId: record.comparisonId,
      testKind: record.testKind,
      branchName: record.branchName,
      reason: record.reason ?? null,
      note: record.note ?? null,
      variant: {
        viewport: record.variantViewport,
        browser: record.variantBrowser,
        environment: record.variantEnvironment,
      },
      candidateHash: record.candidateHash,
      baselineHash: record.baselineHash,
      mismatchPixelCount: record.mismatchPixelCount,
      mismatchPageCount: record.mismatchPageCount,
      pageCount: record.pageCount,
    },
    { excludeExtraneousValues: true },
  );
}
