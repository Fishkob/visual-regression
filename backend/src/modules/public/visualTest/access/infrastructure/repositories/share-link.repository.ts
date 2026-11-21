import { Injectable } from '@nestjs/common';
import { BaseRepository } from '@/prisma/base.repository';
import type { ShareLink, ShareScope } from '@/prisma/client';

export interface CreateShareLinkInput {
  tokenHash: string;
  scope: ShareScope;
  projectId: string;
  testName: string | null;
  branchName: string | null;
  runKey: string | null;
  createdBy: string | null;
  passphraseHash: string | null;
  expiresAt: Date;
}

// Every read carries the project name: the route and the DTO keep speaking
// `projectName`, while the row itself only stores the stable id.
// The project's id rides along with its name: the revoke route names no project
// (the row does), so the service checks the caller's project scope against this
// id (ADR-082).
export const SHARE_LINK_PROJECT_INCLUDE = {
  project: { select: { id: true, name: true } },
} as const;

export type ShareLinkWithProject = ShareLink & {
  project: { id: string; name: string };
};

@Injectable()
export class ShareLinkRepository extends BaseRepository {
  // Transaction-aware: the link row commits with the audit row that records who
  // created it (ShareLinkService owns that transaction).
  async create(input: CreateShareLinkInput): Promise<ShareLinkWithProject> {
    this.assertWritable();
    return this.client.shareLink.create({
      data: input,
      include: SHARE_LINK_PROJECT_INCLUDE,
    });
  }

  async listByProject(projectName: string): Promise<ShareLinkWithProject[]> {
    return this.client.shareLink.findMany({
      where: { project: { name: projectName } },
      include: SHARE_LINK_PROJECT_INCLUDE,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
  }

  async findById(id: string): Promise<ShareLinkWithProject | null> {
    return this.client.shareLink.findUnique({
      where: { id },
      include: SHARE_LINK_PROJECT_INCLUDE,
    });
  }

  async findActiveByTokenHash(
    tokenHash: string,
  ): Promise<ShareLinkWithProject | null> {
    return this.client.shareLink.findFirst({
      where: {
        tokenHash,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      include: SHARE_LINK_PROJECT_INCLUDE,
    });
  }

  async revoke(id: string): Promise<ShareLinkWithProject> {
    this.assertWritable();
    return this.client.shareLink.update({
      where: { id },
      data: { revokedAt: new Date() },
      include: SHARE_LINK_PROJECT_INCLUDE,
    });
  }

  // Deliberately not assertWritable: opening a link is a read, so its access
  // counter and its access log run outside any transaction.
  async touchAccess(id: string): Promise<void> {
    await this.client.shareLink.update({
      where: { id },
      data: { lastAccessedAt: new Date(), accessCount: { increment: 1 } },
    });
  }
}
