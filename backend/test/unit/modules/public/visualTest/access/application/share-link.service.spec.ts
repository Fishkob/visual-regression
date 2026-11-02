import type { Mocked } from 'vitest';
import { ShareLinkService } from '@public/visualTest/access/application/share-link.service';
import { ShareLinkRepository } from '@public/visualTest/access/infrastructure/repositories/share-link.repository';
import { PrismaUnitOfWork } from '@/prisma/prisma-unit-of-work';
import { ProjectRepository } from '@public/visualTest/core/infrastructure/repositories/prisma-project.repository';
import { BranchResolver } from '@public/visualTest/core/application/services/branch-resolver.service';
import { UnifiedTestRepository } from '@public/visualTest/core/infrastructure/repositories/unified-test.repository';
import { RunRepository } from '@public/visualTest/core/infrastructure/repositories/run.repository';
import { UnifiedComparisonsRepository } from '@public/visualTest/core/infrastructure/repositories/unified-comparisons.repository';
import {
  PASSWORD_HASHER,
  PasswordHasherPort,
} from '@common/domain/password-hasher.interface';
import {
  STORAGE_PROVIDER,
  IStorageProvider,
} from '@common/domain/storage-provider.interface';
import { AuditService } from '@internal/audit/audit.service';
import { createMock } from '@test/utils/create-mock';

describe('ShareLinkService', () => {
  let service: ShareLinkService;
  let links: Mocked<ShareLinkRepository>;
  let branches: Mocked<BranchResolver>;
  let tests: Mocked<UnifiedTestRepository>;
  let comparisons: Mocked<UnifiedComparisonsRepository>;
  let storage: Mocked<IStorageProvider>;
  let audit: Mocked<AuditService>;

  const row = {
    id: 'share-1',
    scope: 'TEST',
    projectName: 'shop',
    testName: 'login',
    branchName: 'main',
    runKey: null,
    passphraseHash: null,
    expiresAt: new Date('2026-12-01T00:00:00Z'),
    createdBy: 'alice',
    createdAt: new Date('2026-11-01T00:00:00Z'),
    revokedAt: null,
    lastAccessedAt: null,
    accessCount: 0,
  };

  const comparison = {
    id: 'cmp-1',
    status: 'PENDING_APPROVAL',
    mismatchPixelCount: 42,
    pageCount: undefined,
    diffImageUrl: 'http://storage/diff.png',
    diffPdfUrl: undefined,
    baseline: {
      imageUrl: 'http://storage/baseline.png',
      viewport: '1920x1080',
      browser: 'Chrome',
      environment: 'staging',
      pageCount: null,
    },
    candidate: {
      imageUrl: 'http://storage/candidate.png',
    },
  };

  beforeEach(() => {
    links = createMock<ShareLinkRepository>();
    branches = createMock<BranchResolver>();
    tests = createMock<UnifiedTestRepository>();
    comparisons = createMock<UnifiedComparisonsRepository>();
    storage = createMock<IStorageProvider>();
    audit = createMock<AuditService>();

    links.findActiveByTokenHash.mockResolvedValue(row as never);
    links.touchAccess.mockResolvedValue(undefined);
    branches.resolveRead.mockResolvedValue({
      branchId: 'br-main',
      branchName: 'main',
    } as never);
    tests.findByBranchAndTestName.mockResolvedValue({
      id: 'test-1',
      name: 'login',
      kind: 'image',
      status: 'PENDING_APPROVAL',
      branch: { name: 'main' },
    } as never);
    tests.countVariants.mockResolvedValue(1);
    comparisons.findLatestReviewableByTestId.mockResolvedValue(
      comparison as never,
    );
    storage.signUrl.mockImplementation((url: string) => `signed:${url}`);
    audit.recordAccess.mockResolvedValue(undefined);

    service = new ShareLinkService(
      links,
      createMock<ProjectRepository>(),
      branches,
      tests,
      createMock<RunRepository>(),
      comparisons,
      storage,
      audit,
      createMock<PasswordHasherPort>(),
      createMock<PrismaUnitOfWork>(),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('resolves a TEST share with signed URLs for the reviewable diff', async () => {
    const payload = await service.resolve('token-1', undefined, {
      ip: '127.0.0.1',
    });

    expect(comparisons.findLatestReviewableByTestId).toHaveBeenCalledWith(
      'test-1',
    );
    expect(payload.comparison).toEqual({
      id: 'cmp-1',
      status: 'PENDING_APPROVAL',
      kind: 'image',
      mismatchPixelCount: 42,
      mismatchPageCount: null,
      pageCount: null,
      viewport: '1920x1080',
      browser: 'Chrome',
      environment: 'staging',
      baselineUrl: 'signed:http://storage/baseline.png',
      candidateUrl: 'signed:http://storage/candidate.png',
      diffUrl: 'signed:http://storage/diff.png',
    });
    expect(audit.recordAccess).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'share.access', targetId: 'share-1' }),
    );
  });

  it('omits the diff when the test has no reviewable comparison', async () => {
    comparisons.findLatestReviewableByTestId.mockResolvedValue(null);

    const payload = await service.resolve('token-1', undefined);

    expect(payload.comparison).toBeUndefined();
    expect(storage.signUrl).not.toHaveBeenCalled();
  });
});
