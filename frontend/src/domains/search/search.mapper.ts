import type {
  SearchBranchDto,
  SearchProjectDto,
  SearchResultsDto,
  SearchTestDto,
} from "@sdk";
import { isTestKind } from "@/domains/test-kind";
import type {
  SearchBranch,
  SearchProject,
  SearchResults,
  SearchTest,
} from "./search.model";

export function mapSearchProject(dto: SearchProjectDto): SearchProject {
  return { name: dto.name ?? "" };
}

export function mapSearchTest(dto: SearchTestDto): SearchTest {
  return {
    projectName: dto.projectName ?? "",
    branchName: dto.branchName ?? "",
    testName: dto.testName ?? "",
    ...(isTestKind(dto.kind) ? { kind: dto.kind } : {}),
    status: dto.status ?? "",
  };
}

export function mapSearchBranch(dto: SearchBranchDto): SearchBranch {
  return {
    projectName: dto.projectName ?? "",
    branchName: dto.branchName ?? "",
    isDefault: dto.isDefault === true,
  };
}

// Empty groups are the normal answer for a narrow query; a missing payload maps
// to the same empty shape so the palette can render "no matches" without a
// special case.
export function mapSearchResults(
  dto: SearchResultsDto | undefined,
): SearchResults {
  return {
    query: dto?.query ?? "",
    projects: (dto?.projects ?? [])
      .map(mapSearchProject)
      .filter((project) => project.name.length > 0),
    tests: (dto?.tests ?? []).map(mapSearchTest),
    branches: (dto?.branches ?? []).map(mapSearchBranch),
  };
}
