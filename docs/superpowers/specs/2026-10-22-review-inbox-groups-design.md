# Review-Inbox & Project Groups — Design

## Status

Accepted — 2026-10-22. Awaiting implementation.

## Context

The frontend currently works as a project-scoped review console. The project
list shows only a binary pending flag, the project page splits image and PDF
tests into two different UIs, and there is no way to see pending work across
projects. CI creates projects automatically. Users authenticate globally; there
is no team, ownership, or permission model.

The primary workflow is reviewing pending changes. The platform is self-hosted
and groups are an organizational concern only: every authenticated user may see
every project. Groups must not imply access isolation.

## Goals

- Make the review inbox the landing page and primary workflow.
- Show pending work across projects, grouped by project group and project.
- Allow projects to be organized into groups without introducing permissions,
  memberships, or team-scoped API keys.
- Replace binary project status with actionable counts.
- Unify the project test list for image and PDF tests.
- Preserve the existing project-scoped review loop and approval semantics.

## Non-goals

- RBAC, memberships, roles, invitations, or tenant isolation.
- Team-scoped API keys or `ApiKey.defaultGroupId`.
- Global cross-project review sessions.
- Commit/branch/build metadata, audit history, comments, assignments,
  notifications, charts, or bulk approval.
- A manual upload UI.
- Rejecting changes (see ADR-023).

## Language

- **Group** — an organizational bucket for projects. UI label only. It has no
  members, permissions, or visibility rules.
- **ProjectGroup** — the code/DB name for the Group entity. `GROUP` is a
  reserved SQL word, so `Group` is not used as a table name.
- **Unassigned** — the UI bucket for projects whose `groupId` is `null`.
- **Inbox** — the cross-project list of pending reviews.

## Information architecture

Desktop uses a slim sidebar; mobile uses a compact top bar. The primary
destinations are:

| Route                                    | Purpose                             |
| ---------------------------------------- | ----------------------------------- |
| `/`                                      | Review inbox (new landing page)     |
| `/projects`                              | Project list, grouped by group      |
| `/groups`                                | Group management                    |
| `/projects/:projectName`                 | Project detail                      |
| `/projects/:projectName/tests/:testName` | Review detail                       |
| `/projects/:projectName/done`            | Completion of a project review pass |

Breadcrumbs become `Projects / Group / Project / Test`. The group segment is
omitted for unassigned projects.

The current `/` project-list route moves to `/projects`. Existing bookmarks to
`/` land on the inbox, which is the intended new entry point.

## Data model

Add `ProjectGroup`:

```prisma
model ProjectGroup {
  id        String    @id @default(cuid())
  name      String    @unique
  createdAt DateTime  @default(now())
  projects  Project[]

  @@map("ProjectGroup")
}
```

Add to `Project`:

```prisma
groupId String?
group   ProjectGroup? @relation(fields: [groupId], references: [id], onDelete: SetNull)

@@index([groupId])
```

Existing projects are not backfilled. They appear under **Unassigned** until a
user moves them. Deleting a group sets its projects to unassigned; it never
deletes projects or tests.

Group names are trimmed, 1–80 characters, and may contain spaces. Names are
unique. The UI shows the existing names so duplicates are avoidable; the server
returns `409` on an exact duplicate.

## API

### Project list

Extend `ProjectDto` and the `GET /api/v1/projects/pending` response:

- `groupId?: string | null`
- `groupName?: string | null`
- `pendingCount: number` — pending comparisons in the project
- `testCount: number` — distinct tests, not variants
- `pending?: boolean` — kept for compatibility; the UI uses counts

### Global pending inbox

New endpoint:

```http
GET /api/v1/review/pending?skip=0&take=50
```

Response: paginated list of pending reviews.

```json
{
  "data": [
    {
      "comparisonId": "cmp_123",
      "projectName": "checkout-ui",
      "groupId": "grp_1",
      "groupName": "Checkout",
      "testName": "checkout-flow",
      "kind": "image",
      "variant": {
        "viewport": "1920x1080",
        "browser": "chrome",
        "environment": "staging"
      },
      "mismatchPixelCount": 157,
      "mismatchPageCount": null,
      "createdAt": "2026-10-20T09:12:00.000Z"
    }
  ],
  "meta": { "page": 1, "limit": 50, "total": 12 }
}
```

- Sorted by `createdAt` ascending (oldest first), then by id for stability.
- Protected by the existing global authentication guard; no additional guard.
- The endpoint is a read model joining Comparison → Test → Project → Group.
- The first slice uses the existing fetch-all pagination helper. If inbox sizes
  become consistently large, switch the frontend to an infinite query.

### Groups

- `GET /api/v1/groups` — list groups with `projectCount`, sorted by name.
- `POST /api/v1/groups` — `{ name }`; `409` on duplicate.
- `PATCH /api/v1/groups/:id` — `{ name }`; `409` on duplicate.
- `DELETE /api/v1/groups/:id` — projects move to unassigned; returns
  `{ success: true }`.

### Project commands

- `POST /api/v1/projects` accepts optional `groupId`.
- `PATCH /api/v1/projects/:projectName` accepts `{ groupId: string | null }`.
  `null` moves the project to unassigned. Returns the updated `ProjectDto`.

### Unchanged

- Upload endpoints, upload SDK, and project auto-creation stay unchanged.
  CI-created projects start unassigned.
- Existing per-project pending endpoint remains for the project review loop.
- Approval endpoints and comparison pinning remain unchanged.

## Frontend structure

New domain:

```
src/domains/groups/
  group.model.ts
  group.mapper.ts
  query-keys.ts
```

Extensions:

- `projects/` model gains `groupId`, `groupName`, `pendingCount`, `testCount`.
- `pending-tests/` gains a global `reviewInbox` query key and a global list
  query; the existing project-scoped query remains.
- `lib/invalidation.ts` gains group/project/inbox rules.

New composables:

- `useReviewInbox`
- `useGroups`
- `useProjectCreate`
- `useProjectGroupAssignment`
- `useProjectReviewStart` (start a project pass at its first pending review)

Extended composables:

- `useReviewSession` exposes progress (`current`, `total`) and accepts a
  `returnToInbox` option for single reviews entered with `from=inbox`.
- `useTestNavigation` carries the inbox return destination when opening a
  single review.

New views:

- `InboxView.vue`
- `GroupsView.vue`

Rebuilt views:

- `ProjectsView.vue` — grouped project list and create dialog.
- `ProjectDetailView.vue` — unified test list and group header.
- `ProjectDetailView`/`PdfTestDetailsView` review headers — context and progress.

New components:

- `AppSidebar.vue`
- `InboxProjectSection.vue`
- `ProjectGroupSection.vue`
- `NewProjectDialog.vue`
- `MoveProjectDialog.vue`
- `GroupFormDialog.vue`

No view imports from `@sdk`. Data flow remains SDK → mapper → composable → view.

## UI behavior

### Inbox

Header summary: `N changes to review across M projects`.

Filters: group, kind, project search. Filters are client-side in the first
slice because the endpoint returns the full pending set.

Grouping and ordering:

- Groups alphabetically.
- **Unassigned** last.
- Projects inside a group by oldest pending review.
- Reviews inside a project oldest first.

Each row shows test name, variant, kind badge, mismatch, and age.

Actions:

- Clicking a row opens a **single review** at
  `...?viewport=...&browser=...&environment=...&from=inbox`.
  After approve or skip, navigate back to `/` and refetch the inbox.
- A per-project **Review N** button starts the existing project review loop at
  the first pending review. The loop still ends on
  `/projects/:projectName/done`.

Empty state: `All caught up` with a link to Projects.

### Projects

- Grouped sections with **Unassigned** last.
- Each project shows pending count, distinct test count, and its group.
- Search and group filter are encoded in the URL.
- **New project** dialog: name + optional group, with inline **New group**.
- Empty state offers **New project** instead of a search hint when there are no
  projects at all.

### Groups

- List of groups with project counts.
- Create, rename, delete.
- Delete confirmation: `Projects will move to Unassigned`.
- No members, roles, or visibility controls.

### Project detail

- Header: name, group, pending count, test count; **Move to group** action.
- One unified test list for images and PDFs with an `All / Images / PDFs` filter.
- Tests expand into variant rows with status, as today.
- Filters and search are encoded in the URL and survive reload/navigation.
- The existing PDF detail route is unchanged; PDF variants open it with the
  variant query parameters.

### Review detail

- Context header: group, project, test, variant, kind, mismatch, pending age.
- Sticky footer: Skip / Approve changes (unchanged safety semantics).
- Project loop shows progress (`3 of 12`) and supports `a` = approve,
  `s` = skip, `Esc` = back.
- Shortcuts are disabled while an input, textarea, select, or contenteditable
  element is focused, and when modifier keys are held.
- Single reviews from the inbox use `from=inbox`; after the decision they return
  to `/` instead of continuing a project loop.

## Cache and invalidation

- Group create/rename/delete: `groups`, `projects`, `reviewInbox`.
- Project create: `projects`.
- Project move: `groups`, `projects`, `reviewInbox`.
- Approve/skip: existing pending/detail invalidation plus `reviewInbox`.
- Inbox approval removes the item optimistically and restores the snapshot on
  failure, reusing the established `useSdkMutation` + rollback pattern.

## Error handling

- Duplicate group/project name: `409`, field-level message in the dialog.
- Missing group/project: `404`; the list refetches and removes the stale item.
- Stale inbox review: approval returns `CONFLICT`; the inbox refetches and a
  toast explains that the comparison was superseded.
- Deleting a group never deletes projects; the confirmation states the
  unassignment.
- Loading/error/empty states use the existing `AsyncState` and `ErrorAlert`
  patterns with retry.
- The **Unassigned** bucket is always available and never rendered as a broken
  or unnamed group.

## Accessibility and responsive behavior

- Sidebar uses a `nav` landmark; active destination is marked with
  `aria-current`.
- Route changes move focus to the page heading.
- Status is not conveyed by color alone; badges keep text labels.
- Tables remain horizontally scrollable on narrow screens; primary actions stay
  reachable.
- New dialogs use the existing focus-trap/dialog primitives and have accessible
  names.
- Keyboard shortcuts have visible hints and are disabled inside form controls.

## Testing

Backend:

- Unit tests for group creation/rename/delete, duplicate names, and unassignment.
- Unit tests for project counts (`pendingCount`, distinct `testCount`) and the
  global pending read ordering.
- E2E: create group → create project in group → move project → delete group →
  project is unassigned.

Frontend:

- Unit tests for group/project/inbox mappers and query keys.
- Component tests for inbox grouping, unassigned bucket, create/move dialogs,
  group management, empty states, and error states.
- E2E: inbox single review returns to inbox; project **Review N** runs the
  existing loop and ends on `/done`.
- Quality: add Inbox, Projects, and Groups stories to
  `frontend/tests/quality/cases.ts`; capture light/dark baselines and run the
  axe scan on the new shell and dialogs.

## Rollout order

1. Prisma schema + migration (`ProjectGroup`, `Project.groupId`, index).
2. Group endpoints, project read extensions, global pending endpoint.
3. Regenerate and build the SDK.
4. Frontend domains, composables, route/shell changes.
5. Inbox, project list, groups.
6. Project detail unification.
7. Review detail context, progress, keyboard, and `from=inbox`.
8. Component/e2e tests and quality baselines.

## Risks

- `/` changing meaning can surprise existing users. The sidebar makes the new
  entry point explicit; no legacy redirect is added.
- The global pending query joins several tables. It relies on the existing
  `UnifiedComparison.status` index and the new `Project.groupId` index; verify
  with a realistic dataset.
- Unifying image/PDF test lists touches existing CT/e2e expectations. Keep it a
  separate implementation step.
- Groups are not permissions. If real isolation is needed later, Groups become
  Teams with memberships and a switcher; the current UI must not suggest that
  isolation already exists.
