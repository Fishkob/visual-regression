import { Injectable } from '@nestjs/common';
import { BaseRepository } from '@/prisma/base.repository';
import type { TestKind } from '@common/domain/test-kind';
import type { ApprovalReason } from '@/prisma/client';

// Everything an approval records about the decision, denormalized at write
// time. The row has no foreign keys on purpose: image approval deletes the
// comparison and a test (or branch, or project) can be deleted, but "who
// approved what" must survive all of it.
export interface ApprovalAuditEntry {
  projectName: string;
  testName: string;
  branchName: string | null;
  testId: string;
  runId?: string | null;
  runKey?: string | null;
  testKind: TestKind;
  variantViewport: string;
  variantBrowser: string;
  variantEnvironment: string;
  comparisonId: string;
  baselineId: string;
  candidateId: string;
  candidateHash: string;
  baselineHash: string | null;
  mismatchPixelCount: number | null;
  mismatchPageCount: number | null;
  pageCount: number | null;
  approvedBy: string;
  reason?: ApprovalReason | null;
  note?: string | null;
}

export interface ApprovalAuditRecord extends ApprovalAuditEntry {
  id: string;
  approvedAt: Date;
}

// The history read is a fixed recent slice: the UI shows what happened lately,
// not an archive. The default bounds the response, the hard maximum bounds a
// caller that asks for more.
export const DEFAULT_APPROVAL_HISTORY_LIMIT = 20;
export const MAX_APPROVAL_HISTORY_LIMIT = 100;

@Injectable()
export class ApprovalAuditRepository extends BaseRepository {
  // Written inside the approval's StateChangeWorkflow transaction: an audit row
  // can never commit without its approval (or the approval without its audit
  // row). assertWritable is the backstop that keeps a future caller from
  // writing the trail outside that transaction.
  async record(entry: ApprovalAuditEntry): Promise<void> {
    this.assertWritable();
    await this.client.approval.create({ data: entry });
  }

  async findForTest(input: {
    projectId: string;
    testName: string;
    branchName?: string;
    take?: number;
  }): Promise<ApprovalAuditRecord[]> {
    return this.client.approval.findMany({
      where: {
        projectId: input.projectId,
        testName: input.testName,
        ...(input.branchName ? { branchName: input.branchName } : {}),
      },
      orderBy: { approvedAt: 'desc' },
      take: clampTake(input.take),
    });
  }
}

function clampTake(take?: number): number {
  if (take === undefined) return DEFAULT_APPROVAL_HISTORY_LIMIT;
  return Math.min(Math.max(Math.trunc(take), 1), MAX_APPROVAL_HISTORY_LIMIT);
}
