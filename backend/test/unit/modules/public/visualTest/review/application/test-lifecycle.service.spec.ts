import type { Mocked } from 'vitest';
import { ConflictException } from '@nestjs/common';
import { TestLifecycleService } from '@public/visualTest/review/application/test-lifecycle.service';
import { TestResolver } from '@public/visualTest/core/application/services/test-resolver.service';
import { ComparisonOutcomeService } from '@public/visualTest/core/application/services/comparison-outcome.service';
import { UnifiedTestRepository } from '@public/visualTest/core/infrastructure/repositories/unified-test.repository';
import { AuditService } from '@internal/audit/audit.service';
import { DomainError } from '@common/domain/domain-error';
import { createMock } from '@test/utils/create-mock';

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: 't1',
    name: 'login',
    description: null,
    tags: [],
    mutedUntil: null,
    muteReason: null,
    ...overrides,
  } as never;
}

describe('TestLifecycleService', () => {
  let service: TestLifecycleService;
  let resolver: Mocked<TestResolver>;
  let tests: Mocked<UnifiedTestRepository>;
  let outcomes: Mocked<ComparisonOutcomeService>;
  let audit: Mocked<AuditService>;

  beforeEach(() => {
    resolver = createMock<TestResolver>();
    resolver.findOwnTest.mockResolvedValue({
      id: 't1',
      name: 'login',
      kind: 'image',
    } as never);
    tests = createMock<UnifiedTestRepository>();
    tests.findMetadata.mockResolvedValue(row());
    tests.updateMetadata.mockResolvedValue(row());
    outcomes = createMock<ComparisonOutcomeService>();
    outcomes.flakeForTest.mockResolvedValue({
      transitions: 2,
      changed: 3,
      clean: 1,
    });
    audit = createMock<AuditService>();
    audit.record.mockResolvedValue(undefined);
    service = new TestLifecycleService(resolver, tests, outcomes, audit);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns metadata with the flake signal', async () => {
    const result = await service.get('shop', 'login', 'main');

    expect(result).toEqual(
      expect.objectContaining({
        id: 't1',
        name: 'login',
        isMuted: false,
        flake: { transitions: 2, changed: 3, clean: 1 },
      }),
    );
  });

  it('renames and audits the old name', async () => {
    tests.updateMetadata.mockResolvedValue(row({ name: 'sign-in' }));

    await service.update('shop', 'login', { name: 'sign-in' }, 'ada', 'main');

    expect(tests.updateMetadata).toHaveBeenCalledWith('t1', {
      name: 'sign-in',
    });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'test.update',
        metadata: expect.objectContaining({ renamedFrom: 'login' }),
      }),
    );
  });

  it('maps a duplicate name to a conflict', async () => {
    tests.updateMetadata.mockRejectedValue({ code: 'P2002' });

    await expect(
      service.update('shop', 'login', { name: 'taken' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('normalizes tags and rejects a mute without a reason', async () => {
    await service.update('shop', 'login', {
      tags: ['Checkout', 'checkout', ' ui '],
    });
    expect(tests.updateMetadata).toHaveBeenCalledWith('t1', {
      tags: ['checkout', 'ui'],
    });

    await expect(
      service.update('shop', 'login', {
        mutedUntil: new Date(Date.now() + 60_000).toISOString(),
      }),
    ).rejects.toBeInstanceOf(DomainError);
  });

  it('clears the mute for a past timestamp', async () => {
    await service.update('shop', 'login', {
      mutedUntil: new Date(Date.now() - 60_000).toISOString(),
      muteReason: 'old',
    });

    expect(tests.updateMetadata).toHaveBeenCalledWith('t1', {
      mutedUntil: null,
      muteReason: null,
    });
  });
});
