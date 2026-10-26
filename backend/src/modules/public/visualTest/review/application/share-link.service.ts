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
import { decideRunState } from '@public/visualTest/core/domain/policies/run-state.policy';
import type { RunState } from '@public/visualTest/core/domain/types/run.types';
import {
  ShareLinkRepository,
  type CreateShareLinkInput,
} from '@public/visualTest/review/infrastructure/repositories/share-link.repository';
import type { ShareLink } from '@/prisma/client';

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
        projectName,
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
        projectName: row.projectName,
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
    await this.audit.record({
      actor: null,
      action: AUDIT_ACTIONS.shareAccess,
      projectName: row.projectName,
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

  private async buildPayload(row: ShareLink): Promise<SharePayload> {
    const base = {
      scope: row.scope,
      projectName: row.projectName,
      testName: row.testName,
      branchName: row.branchName,
      runKey: row.runKey,
      expiresAt: row.expiresAt,
      project: { name: row.projectName },
    } as const;
    if (row.scope === 'PROJECT') {
      const tests = await this.tests.listForProject(row.projectName);
      return {
        ...base,
        tests: tests.slice(0, MAX_TESTS).map((test) => ({
          name: test.name,
          kind: test.kind,
          status: test.status,
          branchName: test.branch.name,
        })),
      };
    }
    if (row.scope === 'TEST') {
      const branch = await this.branches.resolveRead(
        row.projectName,
        row.branchName ?? undefined,
      );
      const test = await this.tests.findByBranchAndTestName(
        branch.branchId,
        row.testName ?? '',
      );
      if (!test)
        throw new DomainError('Share link target not found', 'NOT_FOUND');
      return {
        ...base,
        test: {
          name: test.name,
          kind: test.kind,
          status: (test as { status?: string }).status ?? 'PENDING',
          branchName: branch.branchName,
          variantCount: await this.tests.countVariants(test.id),
        },
      };
    }
    const branch = await this.branches.resolveRead(
      row.projectName,
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

  private toView(row: ShareLink): ShareLinkView {
    return {
      id: row.id,
      scope: row.scope,
      projectName: row.projectName,
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
