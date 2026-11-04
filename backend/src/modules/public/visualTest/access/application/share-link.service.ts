import { Inject, Injectable } from '@nestjs/common';
import { PrismaUnitOfWork } from '@/prisma/prisma-unit-of-work';

import { randomBytes } from 'node:crypto';
import { DomainError } from '@common/domain/domain-error';
import {
  PASSWORD_HASHER,
  type PasswordHasherPort,
} from '@common/domain/password-hasher.interface';
import { AuditService } from '@internal/audit/audit.service';
import { AUDIT_ACTIONS } from '@internal/audit/audit.types';
import { hashToken } from '@internal/auth/token-hash';
import { BranchResolver } from '@public/visualTest/core/application/services/branch-resolver.service';
import { ProjectRepository } from '@public/visualTest/core/infrastructure/repositories/prisma-project.repository';
import { UnifiedTestRepository } from '@public/visualTest/core/infrastructure/repositories/unified-test.repository';
import { RunRepository } from '@public/visualTest/core/infrastructure/repositories/run.repository';
import { UnifiedComparisonsRepository } from '@public/visualTest/core/infrastructure/repositories/unified-comparisons.repository';
import {
  STORAGE_PROVIDER,
  type IStorageProvider,
} from '@common/domain/storage-provider.interface';
import { decideRunState } from '@public/visualTest/core/domain/policies/run-state.policy';
import type { RunState } from '@public/visualTest/core/domain/types/run.types';
import {
  ShareLinkRepository,
  type CreateShareLinkInput,
  type ShareLinkWithProject,
} from '@public/visualTest/access/infrastructure/repositories/share-link.repository';

export type ShareScopeValue = 'PROJECT' | 'TEST' | 'RUN';

export interface ShareLinkView {
  id: string;
  scope: ShareScopeValue;
  projectName: string;
  testName: string | null;
  branchName: string | null;
  runKey: string | null;
  createdBy: string | null;
  createdAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
  lastAccessedAt: Date | null;
  accessCount: number;
  hasPassphrase: boolean;
}

export interface SharePayload {
  scope: ShareScopeValue;
  projectName: string;
  testName: string | null;
  branchName: string | null;
  runKey: string | null;
  expiresAt: Date;
  project: { name: string };
  test?: {
    name: string;
    kind: string;
    status: string;
    branchName: string;
    variantCount: number;
  };
  // The diff a TEST share opens: presigned, short-lived URLs of the latest
  // reviewable comparison. Built on every resolve, so a page reload after the
  // URL TTL gets fresh signatures. Absent when the test has no reviewable
  // comparison (nothing to show).
  comparison?: {
    id: string;
    status: string;
    kind: string;
    mismatchPixelCount: number;
    mismatchPageCount: number | null;
    pageCount: number | null;
    viewport: string;
    browser: string;
    environment: string;
    baselineUrl: string | null;
    candidateUrl: string | null;
    diffUrl: string | null;
  };
  run?: {
    key: string;
    branchName: string;
    state: RunState;
    finishedAt: Date | null;
    counts: {
      pendingComparisons: number;
      mutedPending: number;
      pendingJobs: number;
      failedJobs: number;
      approved: number;
      testCount: number;
    };
  };
  tests?: {
    name: string;
    kind: string;
    status: string;
    branchName: string;
  }[];
}

const TOKEN_BYTES = 32;
const DEFAULT_DAYS = 7;
const MAX_TESTS = 500;

@Injectable()
export class ShareLinkService {
  constructor(
    private readonly links: ShareLinkRepository,
    private readonly projects: ProjectRepository,
    private readonly branches: BranchResolver,
    private readonly tests: UnifiedTestRepository,
    private readonly runs: RunRepository,
    private readonly comparisons: UnifiedComparisonsRepository,
    @Inject(STORAGE_PROVIDER) private readonly storage: IStorageProvider,
    private readonly audit: AuditService,
    @Inject(PASSWORD_HASHER) private readonly hasher: PasswordHasherPort,
    private readonly uow: PrismaUnitOfWork,
  ) {}

  async create(
    projectName: string,
    input: {
      scope: ShareScopeValue;
      testName?: string;
      branch?: string;
      runKey?: string;
      expiresInDays?: number;
      passphrase?: string;
    },
    actor: string,
  ): Promise<{ link: ShareLinkView; token: string }> {
    let branchName: string | null = null;
    if (input.scope === 'TEST') {
      if (!input.testName) {
        throw new DomainError(
          'testName is required for a test share',
          'BAD_REQUEST',
        );
      }
      const branch = await this.branches.resolveRead(projectName, input.branch);
      branchName = branch.branchName;
      const test = await this.tests.findByBranchAndTestName(
        branch.branchId,
        input.testName,
      );
      if (!test) throw new DomainError('Test not found', 'NOT_FOUND');
    } else if (input.scope === 'RUN') {
      if (!input.runKey) {
        throw new DomainError(
          'runKey is required for a run share',
          'BAD_REQUEST',
        );
      }
      const branch = await this.branches.resolveRead(projectName, input.branch);
      branchName = branch.branchName;
      const run = await this.runs.findByBranchKey(
        branch.branchId,
        input.runKey,
      );
      if (!run) throw new DomainError('Run not found', 'NOT_FOUND');
    } else if (input.branch) {
      branchName = (await this.branches.resolveRead(projectName, input.branch))
        .branchName;
    }

    // The row stores the id, not the name, so the link dies with its project and
    // survives a rename. Resolving here also turns an unknown project into a 404
    // before a token is minted.
    const project = await this.projects.requireByName(projectName);
    const days = Math.min(
      Math.max(input.expiresInDays ?? DEFAULT_DAYS, 1),
      365,
    );
    const token = randomBytes(TOKEN_BYTES).toString('base64url');
    const passphraseHash = input.passphrase
      ? await this.hasher.hashPassword(input.passphrase)
      : null;
    // The link and its trail commit together: a link that hands out evidence
    // without a record of who minted it is exactly what sharing must not do.
    return this.uow.execute(async () => {
      const row = await this.links.create({
        tokenHash: hashToken(token),
        scope: input.scope,
        projectId: project.id,
        testName: input.testName ?? null,
        branchName,
        runKey: input.runKey ?? null,
        createdBy: actor,
        passphraseHash,
        expiresAt: new Date(Date.now() + days * 24 * 60 * 60 * 1000),
      } satisfies CreateShareLinkInput);
      await this.audit.record({
        actor,
        action: AUDIT_ACTIONS.shareCreate,
        projectName,
        testName: input.testName ?? null,
        branchName,
        targetType: 'share-link',
        targetId: row.id,
        metadata: {
          scope: input.scope,
          expiresAt: row.expiresAt.toISOString(),
        },
      });
      return { link: this.toView(row), token };
    });
  }

  async list(projectName: string): Promise<ShareLinkView[]> {
    // An unknown parent project is a 404, not an empty list: a typo must not
    // read as "this project has no share links" (matches webhooks/storage).
    await this.projects.requireByName(projectName);
    return (await this.links.listByProject(projectName)).map((row) =>
      this.toView(row),
    );
  }

  async revoke(id: string, actor: string): Promise<ShareLinkView> {
    const row = await this.links.findById(id);
    if (!row) throw new DomainError('Share link not found', 'NOT_FOUND');
    return this.uow.execute(async () => {
      const revoked = row.revokedAt ? row : await this.links.revoke(id);
      await this.audit.record({
        actor,
        action: AUDIT_ACTIONS.shareRevoke,
        projectName: row.project.name,
        testName: row.testName,
        branchName: row.branchName,
        targetType: 'share-link',
        targetId: id,
      });
      return this.toView(revoked);
    });
  }

  async resolve(
    token: string,
    passphrase: string | undefined,
    context: { ip?: string | null; userAgent?: string | null } = {},
  ): Promise<SharePayload> {
    const row = await this.links.findActiveByTokenHash(hashToken(token));
    if (!row) throw new DomainError('Share link not found', 'NOT_FOUND');
    if (
      row.passphraseHash &&
      (!passphrase ||
        !(await this.hasher.verifyPassword(passphrase, row.passphraseHash)))
    ) {
      throw new DomainError('Passphrase required', 'FORBIDDEN');
    }
    const payload = await this.buildPayload(row);
    await this.links.touchAccess(row.id);
    // A read, not a mutation: nothing to ride, so the log cannot fail the page.
    await this.audit.recordAccess({
      actor: null,
      action: AUDIT_ACTIONS.shareAccess,
      projectName: row.project.name,
      testName: row.testName,
      branchName: row.branchName,
      targetType: 'share-link',
      targetId: row.id,
      metadata: {
        ip: context.ip ?? null,
        userAgent: context.userAgent ?? null,
      },
    });
    return payload;
  }

  private async buildPayload(row: ShareLinkWithProject): Promise<SharePayload> {
    const projectName = row.project.name;
    const base = {
      scope: row.scope,
      projectName,
      testName: row.testName,
      branchName: row.branchName,
      runKey: row.runKey,
      expiresAt: row.expiresAt,
      project: { name: projectName },
    } as const;
    if (row.scope === 'PROJECT') {
      // A deleted project must not read as "a project with no tests": resolving
      // the branch first makes a vanished target a 404, the same answer TEST and
      // RUN links give (ADR-038).
      await this.branches.resolveRead(row.project.name, undefined);
      // The bound belongs in the query: a project-wide link renders MAX_TESTS
      // entries, and loading every test of the project to slice it afterwards
      // made the payload cost grow with the project, not with the response.
      const tests = await this.tests.listForProject(
        row.project.name,
        MAX_TESTS,
      );
      return {
        ...base,
        tests: tests.map((test) => ({
          name: test.name,
          kind: test.kind,
          status: test.status,
          branchName: test.branch.name,
        })),
      };
    }
    if (row.scope === 'TEST') {
      const branch = await this.branches.resolveRead(
        row.project.name,
        row.branchName ?? undefined,
      );
      const test = await this.tests.findByBranchAndTestName(
        branch.branchId,
        row.testName ?? '',
      );
      if (!test)
        throw new DomainError('Share link target not found', 'NOT_FOUND');
      const comparison = await this.comparisons.findLatestReviewableByTestId(
        test.id,
      );
      const signed = (url: string | null | undefined): string | null =>
        url ? this.storage.signUrl(url) : null;
      return {
        ...base,
        test: {
          name: test.name,
          kind: test.kind,
          status: (test as { status?: string }).status ?? 'PENDING',
          branchName: branch.branchName,
          variantCount: await this.tests.countVariants(test.id),
        },
        ...(comparison
          ? {
              comparison: {
                id: comparison.id,
                status: comparison.status,
                kind: test.kind,
                mismatchPixelCount: comparison.mismatchPixelCount,
                mismatchPageCount: comparison.mismatchPageCount ?? null,
                pageCount:
                  comparison.pageCount ??
                  comparison.baseline?.pageCount ??
                  null,
                viewport: comparison.baseline?.viewport ?? '',
                browser: comparison.baseline?.browser ?? '',
                environment: comparison.baseline?.environment ?? '',
                baselineUrl: signed(comparison.baseline?.imageUrl),
                candidateUrl: signed(comparison.candidate?.imageUrl),
                diffUrl: signed(
                  comparison.diffImageUrl ?? comparison.diffPdfUrl,
                ),
              },
            }
          : {}),
      };
    }
    const branch = await this.branches.resolveRead(
      row.project.name,
      row.branchName ?? undefined,
    );
    const run = await this.runs.findByBranchKey(
      branch.branchId,
      row.runKey ?? '',
    );
    if (!run) throw new DomainError('Share link target not found', 'NOT_FOUND');
    const counts = await this.runs.statusCounts(run.id);
    const state = decideRunState(counts, run);
    return {
      ...base,
      run: {
        key: run.key,
        branchName: run.branch.name,
        state,
        finishedAt: run.finishedAt,
        counts,
      },
    };
  }

  private toView(row: ShareLinkWithProject): ShareLinkView {
    return {
      id: row.id,
      scope: row.scope,
      projectName: row.project.name,
      testName: row.testName,
      branchName: row.branchName,
      runKey: row.runKey,
      createdBy: row.createdBy,
      createdAt: row.createdAt,
      expiresAt: row.expiresAt,
      revokedAt: row.revokedAt,
      lastAccessedAt: row.lastAccessedAt,
      accessCount: row.accessCount,
      hasPassphrase: row.passphraseHash !== null,
    };
  }
}
