import { Injectable } from '@nestjs/common';
import { PrismaConnection } from '@/prisma/prisma-connection';
import type { TestKind, TestStatus } from '@/prisma/client';

export interface SearchProjectHit {
  name: string;
}

export interface SearchTestHit {
  projectName: string;
  branchName: string;
  testName: string;
  kind: TestKind;
  status: TestStatus;
}

export interface SearchBranchHit {
  projectName: string;
  branchName: string;
  isDefault: boolean;
}

export interface SearchResults {
  projects: SearchProjectHit[];
  tests: SearchTestHit[];
  branches: SearchBranchHit[];
}

@Injectable()
export class SearchRepository {
  constructor(private readonly connection: PrismaConnection) {}

  private get client() {
    return this.connection.client;
  }

  async search(query: string, limit: number): Promise<SearchResults> {
    const contains = { contains: query, mode: 'insensitive' as const };
    const [projects, tests, branches] = await Promise.all([
      this.client.project.findMany({
        where: { name: contains },
        select: { name: true },
        orderBy: { name: 'asc' },
        take: limit,
      }),
      this.client.unifiedTest.findMany({
        where: {
          OR: [
            { name: contains },
            { branch: { name: contains } },
            { branch: { project: { name: contains } } },
          ],
        },
        select: {
          name: true,
          kind: true,
          status: true,
          branch: {
            select: {
              name: true,
              project: { select: { name: true } },
            },
          },
        },
        orderBy: [{ name: 'asc' }],
        take: limit,
      }),
      this.client.branch.findMany({
        where: {
          OR: [{ name: contains }, { project: { name: contains } }],
        },
        select: {
          name: true,
          project: { select: { name: true, defaultBranchId: true } },
          id: true,
        },
        orderBy: [{ project: { name: 'asc' } }, { name: 'asc' }],
        take: limit,
      }),
    ]);

    return {
      projects,
      tests: tests.map((test) => ({
        projectName: test.branch.project.name,
        branchName: test.branch.name,
        testName: test.name,
        kind: test.kind,
        status: test.status,
      })),
      branches: branches.map((branch) => ({
        projectName: branch.project.name,
        branchName: branch.name,
        isDefault: branch.project.defaultBranchId === branch.id,
      })),
    };
  }
}
