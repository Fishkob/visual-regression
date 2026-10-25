import type { Mocked } from 'vitest';
import { RunResolver } from '@public/visualTest/core/application/services/run-resolver.service';
import { RunRepository } from '@public/visualTest/core/infrastructure/repositories/run.repository';
import { createMock } from '@test/utils/create-mock';

describe('RunResolver', () => {
  let resolver: RunResolver;
  let runs: Mocked<RunRepository>;

  beforeEach(() => {
    runs = createMock<RunRepository>();
    runs.upsertActivity.mockResolvedValue({
      id: 'run-1',
      key: 'ci-1',
    } as never);
    resolver = new RunResolver(runs);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns null when no run key was supplied', async () => {
    await expect(
      resolver.resolveForUpload({ projectId: 'p-1', branchId: 'b-1' }),
    ).resolves.toBeNull();
    expect(runs.upsertActivity).not.toHaveBeenCalled();
  });

  it('upserts activity and commit metadata for a run', async () => {
    const result = await resolver.resolveForUpload({
      projectId: 'p-1',
      branchId: 'b-1',
      runKey: 'ci-1',
      commitSha: 'abc',
      commitMessage: 'feat: x',
      ciUrl: 'https://ci/1',
    });

    expect(runs.upsertActivity).toHaveBeenCalledWith({
      projectId: 'p-1',
      branchId: 'b-1',
      runKey: 'ci-1',
      commitSha: 'abc',
      commitMessage: 'feat: x',
      ciUrl: 'https://ci/1',
    });
    expect(result?.id).toBe('run-1');
  });
});
