import { expect, test } from "@playwright/test";
import {
  createGroup,
  createProject,
  deleteGroup,
  deleteProject,
  getGroups,
  getProjectStatus,
} from "./fixtures/api";
import { TEST_ID } from "@/lib/test-ids";
import { byText, confirmDialog, expectToast } from "./fixtures/ui";

let projectName: string;
let groupName: string;

function unique(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

test.describe("Groups", () => {
  test.beforeEach(() => {
    groupName = unique("e2e-group");
  });

  test.afterEach(async () => {
    const groups = await getGroups();
    const group = groups.find((entry) => entry.name === groupName);
    if (group) await deleteGroup(group.id);
    await deleteProject(projectName);
  });

  test("creates, renames and deletes a group", async ({ page }) => {
    await page.goto("/groups");
    await page.getByTestId(TEST_ID.newGroup).click();
    await page.getByTestId(TEST_ID.groupNameInput).fill(groupName);
    await page.getByTestId(TEST_ID.groupFormSubmit).click();

    await expectToast(page, "Group created");
    const row = byText(page, TEST_ID.groupRow, groupName);
    await expect(row).toBeVisible();
    await expect(row.getByTestId(TEST_ID.groupProjectCount)).toContainText(
      "0 projects",
    );

    const renamed = `${groupName}-renamed`;
    await row.getByTestId(TEST_ID.groupRename).click();
    await page.getByTestId(TEST_ID.groupNameInput).fill(renamed);
    await page.getByTestId(TEST_ID.groupFormSubmit).click();

    await expectToast(page, "Group renamed");
    const renamedRow = byText(page, TEST_ID.groupRow, renamed);
    await expect(renamedRow).toBeVisible();

    await renamedRow.getByTestId(TEST_ID.groupDelete).click();
    await confirmDialog(page);
    await expectToast(page, "Group deleted");
    await expect(byText(page, TEST_ID.groupRow, renamed)).toHaveCount(0);
    groupName = renamed;
  });

  test("counts its projects and keeps them after the group is deleted", async ({
    page,
  }) => {
    const created = await createGroup(groupName);
    const group = (await created.json()) as { id: string };
    projectName = unique("e2e-grouped-project");
    await createProject(projectName, group.id);

    await page.goto("/groups");
    const row = byText(page, TEST_ID.groupRow, groupName);
    await expect(row.getByTestId(TEST_ID.groupProjectCount)).toContainText(
      "1 project",
    );
    await expect(row.getByTestId(TEST_ID.groupProjectCount)).not.toContainText(
      "1 projects",
    );

    await row.getByTestId(TEST_ID.groupDelete).click();
    await confirmDialog(page);
    await expectToast(page, "Group deleted");

    // Deleting a group unassigns its projects; it never deletes them.
    expect(await getProjectStatus(projectName)).toBe(200);
    await page.goto(`/projects/${encodeURIComponent(projectName)}`);
    await expect(page.getByTestId(TEST_ID.projectGroupBadge)).toContainText(
      "Unassigned",
    );
  });
});

test.describe("Projects", () => {
  test.beforeEach(() => {
    projectName = unique("e2e-project");
    groupName = unique("e2e-group");
  });

  test.afterEach(async () => {
    await deleteProject(projectName);
    const groups = await getGroups();
    const group = groups.find((entry) => entry.name === groupName);
    if (group) await deleteGroup(group.id);
  });

  test("creates a project in a group from the project list", async ({
    page,
  }) => {
    const created = await createGroup(groupName);
    expect(created.ok).toBeTruthy();

    await page.goto("/projects");
    await page.getByTestId(TEST_ID.newProject).click();
    await page.getByTestId(TEST_ID.projectNameInput).fill(projectName);
    await page.getByTestId(TEST_ID.projectGroupSelect).click();
    await page.getByRole("option", { name: groupName }).click();
    await page.getByTestId(TEST_ID.projectFormSubmit).click();

    await expectToast(page, "Project created");
    await expect(page).toHaveURL(
      new RegExp(`/projects/${encodeURIComponent(projectName)}$`),
    );
    await expect(page.getByTestId(TEST_ID.projectTitle)).toContainText(
      projectName,
    );
    await expect(page.getByTestId(TEST_ID.projectGroupBadge)).toContainText(
      groupName,
    );
  });

  test("searches and filters projects by group", async ({ page }) => {
    const otherProject = unique("e2e-other-project");
    const created = await createGroup(groupName);
    const group = (await created.json()) as { id: string };
    await createProject(projectName, group.id);
    await createProject(otherProject);

    await page.goto("/projects");
    await expect(byText(page, TEST_ID.tableRow, projectName)).toBeVisible();

    await page.getByTestId(TEST_ID.projectSearch).fill(projectName);
    await expect(byText(page, TEST_ID.tableRow, projectName)).toBeVisible();
    await expect(byText(page, TEST_ID.tableRow, otherProject)).toHaveCount(0);

    await page.getByTestId(TEST_ID.projectSearch).fill("");
    await page.getByTestId(TEST_ID.filterGroup).click();
    await page.getByRole("option", { name: groupName }).click();

    await expect(byText(page, TEST_ID.tableRow, projectName)).toBeVisible();
    await expect(byText(page, TEST_ID.tableRow, otherProject)).toHaveCount(0);

    await deleteProject(otherProject);
  });

  test("moves a project between groups", async ({ page }) => {
    const created = await createGroup(groupName);
    const group = (await created.json()) as { id: string };
    await createProject(projectName);

    await page.goto(`/projects/${encodeURIComponent(projectName)}`);
    await expect(page.getByTestId(TEST_ID.projectGroupBadge)).toContainText(
      "Unassigned",
    );

    await page.getByTestId(TEST_ID.moveProject).click();
    await page.getByTestId(TEST_ID.moveProjectSelect).click();
    await page.getByRole("option", { name: groupName }).click();
    await page.getByTestId(TEST_ID.moveProjectSubmit).click();

    await expectToast(page, "Project moved");
    await expect(page.getByTestId(TEST_ID.projectGroupBadge)).toContainText(
      groupName,
    );

    // And back to unassigned: the dialog's "none" option clears the group.
    await page.getByTestId(TEST_ID.moveProject).click();
    await page.getByTestId(TEST_ID.moveProjectSelect).click();
    await page.getByRole("option", { name: "Unassigned" }).click();
    await page.getByTestId(TEST_ID.moveProjectSubmit).click();
    await expect(page.getByTestId(TEST_ID.projectGroupBadge)).toContainText(
      "Unassigned",
    );
    expect(group.id).toBeTruthy();
  });

  test("deletes a project from the list", async ({ page }) => {
    await createProject(projectName);

    await page.goto("/projects");
    const row = byText(page, TEST_ID.projectRow, projectName);
    await expect(row).toBeVisible();
    await row.getByTestId(TEST_ID.projectActionsButton).click();
    await page.getByTestId(TEST_ID.rowActionDelete).click();
    await confirmDialog(page);

    await expectToast(page, /Deleted project/);
    await expect(byText(page, TEST_ID.tableRow, projectName)).toHaveCount(0);
    expect(await getProjectStatus(projectName)).toBe(404);
  });
});
