import type { Mocked } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { ReviewInboxController } from '@public/visualTest/review/presentation/controllers/review-inbox.controller';
import { ReviewInboxService } from '@public/visualTest/review/application/review-inbox.service';
import { ReviewInboxPaginationDto } from '@common/dto/branch-pagination.dto';
import { InboxBranchesQueryDto } from '@public/visualTest/review/presentation/dto/inbox-branches-query.dto';
import { createMock } from '@test/utils/create-mock';
import { ALL_PROJECTS } from '@common/domain/project-scope';
import type { AuthenticatedRequest } from '@common/http/authenticated-request';

describe('ReviewInboxController', () => {
  let controller: ReviewInboxController;
  let inbox: Mocked<ReviewInboxService>;
  const request = {
    auth: {
      username: 'alice',
      userId: 'u1',
      role: 'MEMBER',
      projectScope: ALL_PROJECTS,
    },
  } as unknown as AuthenticatedRequest;

  beforeEach(() => {
    inbox = createMock<ReviewInboxService>();
    controller = new ReviewInboxController(inbox);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('passes branch and project filters to the service', async () => {
    inbox.getPending.mockResolvedValue({ data: [], meta: {} } as never);

    await controller.getPending(
      request,
      Object.assign(new ReviewInboxPaginationDto(), {
        projectName: 'checkout-ui',
      }),
      'feature/x',
    );

    expect(inbox.getPending).toHaveBeenCalledWith(
      expect.anything(),
      {
        branchName: 'feature/x',
        projectName: 'checkout-ui',
        kind: undefined,
        q: undefined,
      },
      ALL_PROJECTS,
    );
  });

  it('trims the project name and ignores an empty one', async () => {
    inbox.getPending.mockResolvedValue({ data: [], meta: {} } as never);

    await controller.getPending(
      request,
      Object.assign(new ReviewInboxPaginationDto(), { projectName: '   ' }),
      undefined,
    );

    expect(inbox.getPending).toHaveBeenCalledWith(
      expect.anything(),
      {
        branchName: undefined,
        projectName: '',
        kind: undefined,
        q: undefined,
      },
      ALL_PROJECTS,
    );
  });

  it('forwards the inbox filters and trims the search', async () => {
    inbox.getPending.mockResolvedValue({ data: [], meta: {} } as never);

    await controller.getPending(
      request,
      Object.assign(new ReviewInboxPaginationDto(), {
        q: '  login  ',
        kind: 'pdf',
        teamId: 't-1',
      }),
      undefined,
    );

    expect(inbox.getPending).toHaveBeenCalledWith(
      expect.anything(),
      {
        branchName: undefined,
        projectName: undefined,
        kind: 'pdf',
        teamId: 't-1',
        q: 'login',
      },
      ALL_PROJECTS,
    );
  });

  it('lists the pending branches', async () => {
    inbox.getBranchNames.mockResolvedValue(['main', 'feature/x']);

    await expect(
      controller.getBranches(request, new InboxBranchesQueryDto()),
    ).resolves.toEqual(['main', 'feature/x']);
    expect(inbox.getBranchNames).toHaveBeenCalledWith(ALL_PROJECTS, undefined);
  });

  it('hands the team lens to the branch query', async () => {
    inbox.getBranchNames.mockResolvedValue([]);

    await controller.getBranches(
      request,
      Object.assign(new InboxBranchesQueryDto(), { teamId: ' team-1 ' }),
    );

    expect(inbox.getBranchNames).toHaveBeenCalledWith(ALL_PROJECTS, 'team-1');
  });

  it('rejects an invalid project name', async () => {
    await expect(
      controller.getPending(
        request,
        Object.assign(new ReviewInboxPaginationDto(), {
          projectName: 'bad name!',
        }),
        undefined,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(inbox.getPending).not.toHaveBeenCalled();
  });
});
