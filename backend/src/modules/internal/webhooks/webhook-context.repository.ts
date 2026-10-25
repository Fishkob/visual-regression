import { Injectable } from '@nestjs/common';
import { BaseRepository } from '@/prisma/base.repository';

export interface WebhookTestContext {
  projectId: string;
  projectName: string;
  testName: string;
  kind: string;
  branchName: string;
}

// Read-only context enrichment for payloads: the worker knows a testId, the
// approval path knows names. Both need the project id (endpoint lookup) and the
// names (dashboard link).
@Injectable()
export class WebhookContextRepository extends BaseRepository {
  async findTestContext(testId: string): Promise<WebhookTestContext | null> {
    const row = await this.client.unifiedTest.findUnique({
      where: { id: testId },
      select: {
        name: true,
        kind: true,
        branch: {
          select: {
            name: true,
            project: { select: { id: true, name: true } },
          },
        },
      },
    });
    if (!row) return null;
    return {
      projectId: row.branch.project.id,
      projectName: row.branch.project.name,
      testName: row.name,
      kind: row.kind,
      branchName: row.branch.name,
    };
  }

  async findProjectByName(
    projectName: string,
  ): Promise<{ id: string; name: string } | null> {
    return this.client.project.findUnique({
      where: { name: projectName },
      select: { id: true, name: true },
    });
  }
}
