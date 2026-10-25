import { Injectable } from '@nestjs/common';
import { PrismaConnection } from '@/prisma/prisma-connection';
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
export class ShareLinkRepository {
  constructor(private readonly connection: PrismaConnection) {}

  private get client() {
    return this.connection.client;
  }

  async create(input: CreateShareLinkInput): Promise<ShareLink> {
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
    return this.client.shareLink.update({
      where: { id },
      data: { revokedAt: new Date() },
    });
  }

  async touchAccess(id: string): Promise<void> {
    await this.client.shareLink.update({
      where: { id },
      data: { lastAccessedAt: new Date(), accessCount: { increment: 1 } },
    });
  }
}
