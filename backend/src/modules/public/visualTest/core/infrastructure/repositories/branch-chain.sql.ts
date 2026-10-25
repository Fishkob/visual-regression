import { Prisma } from '@/prisma/client';
import { MAX_BRANCH_CHAIN_DEPTH } from '@public/visualTest/core/domain/constants/branch.constants';

// The branch-chain SQL shared by every branch-scoped read model. It lives in
// its own module so the effective-test read and the project overview's variant
// page select from the same "nearest occurrence wins" definition instead of
// re-encoding it.
//
// Walks the branch chain: an explicit target when set, otherwise the project's
// current default branch (which follows a later default change). The own branch
// is depth 0, so "nearest ancestor wins" is a plain ORDER BY depth. The depth cap
// keeps a corrupt graph from becoming an unbounded query.
export const CHAIN_CTE = (branchId: string) => Prisma.sql`
  WITH RECURSIVE chain AS (
    SELECT b."id", b."targetBranchId", b."projectId", 0 AS depth
    FROM "Branch" b
    WHERE b."id" = ${branchId}
    UNION ALL
    SELECT t."id", t."targetBranchId", c."projectId", c.depth + 1
    FROM "Branch" t
    JOIN chain c ON t."id" = COALESCE(
      c."targetBranchId",
      (SELECT p."defaultBranchId" FROM "Project" p WHERE p."id" = c."projectId")
    )
    WHERE t."id" <> c."id" AND c.depth < ${MAX_BRANCH_CHAIN_DEPTH}
  )
`;

// The effective set of a branch: every test name materialised somewhere on the
// chain, reduced to its nearest occurrence. The kind filter is deliberately NOT
// applied here — filtering before the ranking would drop the branch's own row
// for a name and surface a shadowed ancestor row of a different kind, which is
// not the test this branch has.
export const RANKED_CTE = (branchId: string) => Prisma.sql`
  ${CHAIN_CTE(branchId)}
  , ranked AS (
    SELECT t."id", t."name", t."kind", t."status", t."createdAt", t."branchId", c."depth",
           ROW_NUMBER() OVER (PARTITION BY t."name" ORDER BY c."depth" ASC) AS rn
    FROM "UnifiedTest" t
    JOIN chain c ON t."branchId" = c."id"
  )
`;
