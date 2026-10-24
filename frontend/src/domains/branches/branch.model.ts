export interface ProjectBranch {
  name: string;
  isDefault: boolean;
  isArchived: boolean;
  targetBranchName: string | null;
  testCount: number;
  pendingCount: number;
  createdAt: string;
}
