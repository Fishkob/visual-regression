import { Injectable } from '@nestjs/common';
import { BaseRepository } from '@/prisma/base.repository';
import type { ShareLink, ShareScope } from '@/prisma/client';

export interface CreateShareLinkInput {
  tokenHash: string;
  scope: ShareScope;
  projectName: string;
  testName: string | null;
  branchName: string | null;
  runKey: string | null;
  createdBy: string | null;
  passphraseHash: string | null;
  expiresAt: Date;
}

@Injectable()
export class ShareLinkRepository extends BaseRepository {
  // Transaction-aware: the link row commits with the audit row that records who
  // created it (ShareLinkService owns that transaction).
  async create(input: CreateShareLinkInput): Promise<ShareLink> {
    this.assertWritable();
    return this.client.shareLink.create({ data: input });
  }

  async listByProject(projectName: string): Promise<ShareLink[]> {
    return this.client.shareLink.findMany({
      where: { projectName },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
  }

  async findById(id: string): Promise<ShareLink | null> {
    return this.client.shareLink.findUnique({ where: { id } });
  }

  async findActiveByTokenHash(tokenHash: string): Promise<ShareLink | null> {
    return this.client.shareLink.findFirst({
      where: {
        tokenHash,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
    });
  }

  async revoke(id: string): Promise<ShareLink> {
    this.assertWritable();
    return this.client.shareLink.update({
      where: { id },
      data: { revokedAt: new Date() },
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
