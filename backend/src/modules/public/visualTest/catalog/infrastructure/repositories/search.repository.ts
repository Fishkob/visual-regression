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

// Global search is a finder over *materialized* tests, not a branch-scoped
// read: every test hit names the branch the test lives on, and the palette
// navigates with that branch, so one name materialized on two branches returns
// two destinations on purpose — resolving through the Branch View would either
// multiply the hits by every branch that inherits the test or collapse them to
// a branch the user did not ask for. ADR-027 names the inbox as such an
// exception; this is the second one.
//
// Archived branches are not destinations: their tests and the branches
// themselves stay out of the results. "Default branch" is read through the
// project's `defaultBranch` relation — the same fact `BranchResolver` resolves —
// rather than re-derived from the chain.
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
          branch: { isArchived: false },
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
          isArchived: false,
          OR: [{ name: contains }, { project: { name: contains } }],
        },
        select: {
          name: true,
          project: {
            select: { name: true, defaultBranch: { select: { name: true } } },
          },
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
        isDefault: branch.name === branch.project.defaultBranch?.name,
      })),
    };
  }
}
