import type { Mocked } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { ReviewInboxController } from '@public/visualTest/review/presentation/controllers/review-inbox.controller';
import { ReviewInboxService } from '@public/visualTest/review/application/review-inbox.service';
import { ReviewInboxPaginationDto } from '@common/dto/branch-pagination.dto';
import { createMock } from '@test/utils/create-mock';

describe('ReviewInboxController', () => {
  let controller: ReviewInboxController;
  let inbox: Mocked<ReviewInboxService>;

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
      Object.assign(new ReviewInboxPaginationDto(), {
        projectName: 'checkout-ui',
      }),
      'feature/x',
    );

    expect(inbox.getPending).toHaveBeenCalledWith(expect.anything(), {
      branchName: 'feature/x',
      projectName: 'checkout-ui',
      kind: undefined,
      groupId: undefined,
      q: undefined,
    });
  });

  it('trims the project name and ignores an empty one', async () => {
    inbox.getPending.mockResolvedValue({ data: [], meta: {} } as never);

    await controller.getPending(
      Object.assign(new ReviewInboxPaginationDto(), { projectName: '   ' }),
      undefined,
    );

    expect(inbox.getPending).toHaveBeenCalledWith(expect.anything(), {
      branchName: undefined,
      projectName: '',
      kind: undefined,
      groupId: undefined,
      q: undefined,
    });
  });

  it('forwards the inbox filters and trims the search', async () => {
    inbox.getPending.mockResolvedValue({ data: [], meta: {} } as never);

    await controller.getPending(
      Object.assign(new ReviewInboxPaginationDto(), {
        q: '  login  ',
        kind: 'pdf',
        groupId: 'unassigned',
      }),
      undefined,
    );

    expect(inbox.getPending).toHaveBeenCalledWith(expect.anything(), {
      branchName: undefined,
      projectName: undefined,
      kind: 'pdf',
      groupId: 'unassigned',
      q: 'login',
    });
  });

  it('lists the pending branches', async () => {
    inbox.getBranchNames.mockResolvedValue(['main', 'feature/x']);

    await expect(controller.getBranches()).resolves.toEqual([
      'main',
      'feature/x',
    ]);
  });

  it('rejects an invalid project name', async () => {
    await expect(
      controller.getPending(
        Object.assign(new ReviewInboxPaginationDto(), {
          projectName: 'bad name!',
        }),
        undefined,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(inbox.getPending).not.toHaveBeenCalled();
  });
});
