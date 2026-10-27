import { ConflictException, Injectable } from '@nestjs/common';
import { PrismaUnitOfWork } from '@/prisma/prisma-unit-of-work';
import { AUDIT_ACTIONS } from '@internal/audit/audit.types';
import { AuditService } from '@internal/audit/audit.service';
import { DomainError } from '@common/domain/domain-error';
import { TestResolver } from '@public/visualTest/core/application/services/test-resolver.service';
import { ComparisonOutcomeService } from '@public/visualTest/core/application/services/comparison-outcome.service';
import { UnifiedTestRepository } from '@public/visualTest/core/infrastructure/repositories/unified-test.repository';

export interface TestMetadataView {
  id: string;
  name: string;
  description: string | null;
  tags: string[];
  mutedUntil: Date | null;
  muteReason: string | null;
  isMuted: boolean;
  sizePolicy: 'FAIL' | 'PAD' | 'CROP' | 'RESIZE';
  flake: { transitions: number; changed: number; clean: number };
}

const MAX_TAGS = 20;
const MAX_TAG_LENGTH = 40;

@Injectable()
export class TestLifecycleService {
  constructor(
    private readonly resolver: TestResolver,
    private readonly tests: UnifiedTestRepository,
    private readonly outcomes: ComparisonOutcomeService,
    private readonly audit: AuditService,
    private readonly uow: PrismaUnitOfWork,
  ) {}

  async get(
    projectName: string,
    testName: string,
    branchName?: string,
  ): Promise<TestMetadataView> {
    const test = await this.resolver.findOwnTest(
      projectName,
      testName,
      branchName,
    );
    return this.toView(test.id);
  }

  async update(
    projectName: string,
    testName: string,
    changes: {
      name?: string;
      description?: string | null;
      tags?: string[];
      mutedUntil?: string | null;
      muteReason?: string | null;
      sizePolicy?: 'FAIL' | 'PAD' | 'CROP' | 'RESIZE';
    },
    actor: string,
    branchName?: string,
  ): Promise<TestMetadataView> {
    const test = await this.resolver.findOwnTest(
      projectName,
      testName,
      branchName,
    );
    const tags = changes.tags ? this.normalizeTags(changes.tags) : undefined;
    let mutedUntil: Date | null | undefined;
    const trimmedReason = changes.muteReason?.trim();
    let muteReason =
      changes.muteReason !== undefined
        ? trimmedReason && trimmedReason.length > 0
          ? trimmedReason
          : null
        : undefined;
    if (changes.mutedUntil !== undefined) {
      if (changes.mutedUntil === null) {
        mutedUntil = null;
        muteReason = null;
      } else {
        mutedUntil = new Date(changes.mutedUntil);
        if (Number.isNaN(mutedUntil.getTime())) {
          throw new DomainError(
            'mutedUntil must be a valid date',
            'BAD_REQUEST',
          );
        }
        if (mutedUntil.getTime() <= Date.now()) {
          mutedUntil = null;
          muteReason = null;
        } else if (!muteReason) {
          throw new DomainError('A mute reason is required', 'BAD_REQUEST');
        }
      }
    }
    try {
      // The patch and its trail commit together: a rename nobody can attribute
      // is exactly the silent loss the comment and approval paths refuse.
      const updated = await this.uow.execute(async () => {
        const row = await this.tests.updateMetadata(test.id, {
          ...(changes.name !== undefined ? { name: changes.name.trim() } : {}),
          ...(changes.description !== undefined
            ? { description: changes.description }
            : {}),
          ...(tags !== undefined ? { tags } : {}),
          ...(mutedUntil !== undefined ? { mutedUntil } : {}),
          ...(muteReason !== undefined ? { muteReason } : {}),
          ...(changes.sizePolicy !== undefined
            ? { sizePolicy: changes.sizePolicy }
            : {}),
        });
        await this.audit.record({
          actor,
          action: AUDIT_ACTIONS.testUpdate,
          projectName,
          testName: row.name,
          branchName: branchName ?? null,
          targetType: 'test',
          targetId: row.id,
          metadata: {
            ...(changes.name !== undefined ? { renamedFrom: test.name } : {}),
            ...(tags !== undefined ? { tags } : {}),
            ...(mutedUntil !== undefined
              ? { mutedUntil: mutedUntil?.toISOString() ?? null }
              : {}),
          },
        });
        return row;
      });
      return await this.toView(updated.id);
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') {
        throw new ConflictException(
          `A test named "${changes.name}" already exists on this branch`,
        );
      }
      throw error;
    }
  }

  private async toView(id: string): Promise<TestMetadataView> {
    const row = await this.tests.findMetadata(id);
    if (!row) throw new DomainError('Test not found', 'NOT_FOUND');
    const flake = await this.outcomes.flakeForTest(id, 30);
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      tags: row.tags,
      mutedUntil: row.mutedUntil,
      muteReason: row.muteReason,
      isMuted: row.mutedUntil !== null && row.mutedUntil.getTime() > Date.now(),
      sizePolicy: row.sizePolicy,
      flake,
    };
  }

  private normalizeTags(tags: string[]): string[] {
    const normalized = [
      ...new Set(
        tags
          .map((tag) => tag.trim().toLowerCase())
          .filter((tag) => tag.length > 0),
      ),
    ];
    if (normalized.length > MAX_TAGS) {
      throw new DomainError(
        `At most ${String(MAX_TAGS)} tags are allowed`,
        'BAD_REQUEST',
      );
    }
    if (normalized.some((tag) => tag.length > MAX_TAG_LENGTH)) {
      throw new DomainError(
        `Tags must be at most ${String(MAX_TAG_LENGTH)} characters`,
        'BAD_REQUEST',
      );
    }
    return normalized;
  }
}
