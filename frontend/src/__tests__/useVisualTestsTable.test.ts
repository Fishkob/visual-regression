import { describe, it, expect } from "vitest";
import { ref } from "vue";
import { useVisualTestsTable } from "@/composables/useVisualTestsTable";
import type { TestGroup } from "@/domains/projects/test-group";
import {
  STATUS,
  STATUS_FILTER_PENDING,
  STATUS_FILTER_OK,
} from "@/domains/test-status";
import type { VisualTestItem } from "@/domains/projects/project.model";

function badgeCount(group: TestGroup | undefined, status: string): number {
  return group?.badges.find((b) => b.status === status)?.count ?? 0;
}

describe("useVisualTestsTable filters", () => {
  const testTests: VisualTestItem[] = [
    {
      name: "login-form",
      viewport: "1920x1080",
      browser: "chrome",
      environment: "prod",
      latestStatus: "UNCHANGED",
    },
    {
      name: "signup-page",
      viewport: "1920x1080",
      browser: "firefox",
      environment: "prod",
      latestStatus: "PENDING_APPROVAL",
    },
    {
      name: "dashboard",
      viewport: "1280x720",
      browser: "chrome",
      environment: "staging",
      latestStatus: "UNCHANGED",
    },
    {
      name: "settings",
      viewport: "1920x1080",
      browser: "safari",
      environment: "prod",
      latestStatus: "UNCHANGED",
    },
    {
      name: "admin-panel",
      viewport: "1920x1080",
      browser: "chrome",
      environment: "prod",
      latestStatus: "PENDING_APPROVAL",
    },
  ];

  it("returns all tests when no filters applied", () => {
    const testsRef = ref(testTests);
    const { filteredTests } = useVisualTestsTable({ tests: testsRef });

    expect(filteredTests.value).toHaveLength(5);
  });

  it("filters by search term (case-insensitive)", () => {
    const testsRef = ref(testTests);
    const { filteredTests, filters } = useVisualTestsTable({ tests: testsRef });

    filters.value.search = "login";

    expect(filteredTests.value).toHaveLength(1);
    expect(filteredTests.value[0].name).toBe("login-form");
  });

  it("search matches partial names", () => {
    const testsRef = ref(testTests);
    const { filteredTests, filters } = useVisualTestsTable({ tests: testsRef });

    filters.value.search = "page";

    expect(filteredTests.value).toHaveLength(1);
    expect(filteredTests.value[0].name).toBe("signup-page");
  });

  it("search is case-insensitive", () => {
    const testsRef = ref(testTests);
    const { filteredTests, filters } = useVisualTestsTable({ tests: testsRef });

    filters.value.search = "DASHBOARD";

    expect(filteredTests.value).toHaveLength(1);
    expect(filteredTests.value[0].name).toBe("dashboard");
  });

  it("filters by browser", () => {
    const testsRef = ref(testTests);
    const { filteredTests, filters } = useVisualTestsTable({
      tests: testsRef,
    });

    filters.value.browser = "chrome";

    expect(filteredTests.value).toHaveLength(3);
    expect(filteredTests.value.every((t) => t.browser === "chrome")).toBe(true);
  });

  it("filters by viewport", () => {
    const testsRef = ref(testTests);
    const { filteredTests, filters } = useVisualTestsTable({
      tests: testsRef,
    });

    filters.value.viewport = "1920x1080";

    expect(filteredTests.value).toHaveLength(4);
    expect(filteredTests.value.every((t) => t.viewport === "1920x1080")).toBe(
      true,
    );
  });

  it("filters by environment", () => {
    const testsRef = ref(testTests);
    const { filteredTests, filters } = useVisualTestsTable({
      tests: testsRef,
    });

    filters.value.environment = "staging";

    expect(filteredTests.value).toHaveLength(1);
    expect(filteredTests.value[0].name).toBe("dashboard");
  });

  it("filters by status - PENDING shows only pending", () => {
    const testsRef = ref(testTests);
    const { filteredTests, filters } = useVisualTestsTable({
      tests: testsRef,
    });

    filters.value.status = STATUS_FILTER_PENDING;

    expect(filteredTests.value).toHaveLength(2);
    expect(
      filteredTests.value.every((t) => t.latestStatus === "PENDING_APPROVAL"),
    ).toBe(true);
  });

  it("filters by status - OK shows only approved", () => {
    const testsRef = ref(testTests);
    const { filteredTests, filters } = useVisualTestsTable({
      tests: testsRef,
    });

    filters.value.status = STATUS_FILTER_OK;

    expect(filteredTests.value).toHaveLength(3);
    expect(
      filteredTests.value.every((t) => t.latestStatus === "UNCHANGED"),
    ).toBe(true);
  });

  it("combines search and filters with AND logic", () => {
    const testsRef = ref(testTests);
    const { filteredTests, filters } = useVisualTestsTable({
      tests: testsRef,
    });

    filters.value.search = "form";
    filters.value.browser = "chrome";

    expect(filteredTests.value).toHaveLength(1);
    expect(filteredTests.value[0].name).toBe("login-form");
  });

  it("__all filter shows all tests for that filter type", () => {
    const testsRef = ref(testTests);
    const { filteredTests, filters } = useVisualTestsTable({
      tests: testsRef,
    });

    filters.value.browser = "__all";

    expect(filteredTests.value).toHaveLength(5);
  });

  it("resetFilters clears all filters", () => {
    const testsRef = ref(testTests);
    const { filteredTests, filters, resetFilters } = useVisualTestsTable({
      tests: testsRef,
    });

    filters.value.search = "login";
    filters.value.browser = "chrome";
    filters.value.status = "PENDING";

    resetFilters();

    expect(filteredTests.value).toHaveLength(5);
    expect(filters.value.search).toBe("");
    expect(filters.value.browser).toBe("__all");
    expect(filters.value.status).toBe("__all");
  });

  it("extracts unique viewports from tests", () => {
    const testsRef = ref(testTests);
    const { viewports } = useVisualTestsTable({ tests: testsRef });

    expect(viewports.value).toContain("1920x1080");
    expect(viewports.value).toContain("1280x720");
    expect(viewports.value).toHaveLength(2);
  });

  it("extracts unique browsers from tests", () => {
    const testsRef = ref(testTests);
    const { browsers } = useVisualTestsTable({ tests: testsRef });

    expect(browsers.value).toContain("chrome");
    expect(browsers.value).toContain("firefox");
    expect(browsers.value).toContain("safari");
    expect(browsers.value).toHaveLength(3);
  });

  it("extracts unique environments from tests", () => {
    const testsRef = ref(testTests);
    const { environments } = useVisualTestsTable({ tests: testsRef });

    expect(environments.value).toContain("prod");
    expect(environments.value).toContain("staging");
    expect(environments.value).toHaveLength(2);
  });

  it("handles empty tests array", () => {
    const testsRef = ref<VisualTestItem[]>([]);
    const { filteredTests, viewports, browsers, environments } =
      useVisualTestsTable({ tests: testsRef });

    expect(filteredTests.value).toHaveLength(0);
    expect(viewports.value).toHaveLength(0);
    expect(browsers.value).toHaveLength(0);
    expect(environments.value).toHaveLength(0);
  });

  it("handles undefined values in test items", () => {
    const testsWithUndefined = [
      {
        name: undefined,
        viewport: "1920x1080",
        browser: "chrome",
        environment: "prod",
        latestStatus: "UNCHANGED",
      },
      {
        name: "valid-test",
        viewport: undefined,
        browser: undefined,
        environment: undefined,
        latestStatus: undefined,
      },
    ] as VisualTestItem[];

    const testsRef = ref(testsWithUndefined);
    const { filteredTests } = useVisualTestsTable({ tests: testsRef });

    expect(filteredTests.value).toHaveLength(2);
  });

  it("filters work with undefined latestStatus", () => {
    const testsWithNoStatus = [
      { name: "test-with-status", latestStatus: "UNCHANGED" },
      { name: "test-without-status", latestStatus: undefined },
    ] as VisualTestItem[];

    const testsRef = ref(testsWithNoStatus);
    const { filteredTests, filters } = useVisualTestsTable({
      tests: testsRef,
    });

    filters.value.status = STATUS_FILTER_PENDING;
    // undefined status is not PENDING_APPROVAL, so it shows 0 results for PENDING
    expect(filteredTests.value).toHaveLength(0);

    filters.value.status = STATUS_FILTER_OK;
    // undefined status is NOT pending, so it shows in OK filter
    expect(filteredTests.value).toHaveLength(2);
  });
});

describe("useVisualTestsTable groups", () => {
  const groupTests: VisualTestItem[] = [
    {
      name: "login-form",
      viewport: "1920x1080",
      browser: "chrome",
      latestStatus: "UNCHANGED",
    },
    {
      name: "login-form",
      viewport: "1280x720",
      browser: "chrome",
      latestStatus: "PENDING_APPROVAL",
    },
    {
      name: "signup-page",
      viewport: "1920x1080",
      browser: "firefox",
      latestStatus: "UNCHANGED",
    },
    {
      name: "dashboard",
      viewport: "1920x1080",
      browser: "chrome",
      latestStatus: "PENDING_APPROVAL",
    },
    {
      name: "dashboard",
      viewport: "1280x720",
      browser: "safari",
      latestStatus: "UNCHANGED",
    },
    {
      name: "dashboard",
      viewport: "1920x1080",
      browser: "firefox",
      latestStatus: "UNCHANGED",
    },
  ];

  it("groups tests by name", () => {
    const testsRef = ref(groupTests);
    const { groups } = useVisualTestsTable({ tests: testsRef });

    expect(groups.value).toHaveLength(3);
    expect(groups.value.map((g) => g.name).sort()).toEqual([
      "dashboard",
      "login-form",
      "signup-page",
    ]);
  });

  it("groups login-form with 2 variants", () => {
    const testsRef = ref(groupTests);
    const { groups } = useVisualTestsTable({ tests: testsRef });

    const loginGroup = groups.value.find((g) => g.name === "login-form");
    expect(loginGroup).toBeDefined();
    expect(loginGroup!.items).toHaveLength(2);
  });

  it("groups dashboard with 3 variants", () => {
    const testsRef = ref(groupTests);
    const { groups } = useVisualTestsTable({ tests: testsRef });

    const dashboardGroup = groups.value.find((g) => g.name === "dashboard");
    expect(dashboardGroup).toBeDefined();
    expect(dashboardGroup!.items).toHaveLength(3);
  });

  it("counts pending items correctly", () => {
    const testsRef = ref(groupTests);
    const { groups } = useVisualTestsTable({ tests: testsRef });

    const loginGroup = groups.value.find((g) => g.name === "login-form");
    expect(badgeCount(loginGroup, STATUS.PENDING_APPROVAL)).toBe(1);
    expect(badgeCount(loginGroup, STATUS.UNCHANGED)).toBe(1);

    const dashboardGroup = groups.value.find((g) => g.name === "dashboard");
    expect(badgeCount(dashboardGroup, STATUS.PENDING_APPROVAL)).toBe(1);
    expect(badgeCount(dashboardGroup, STATUS.UNCHANGED)).toBe(2);

    const signupGroup = groups.value.find((g) => g.name === "signup-page");
    expect(badgeCount(signupGroup, STATUS.PENDING_APPROVAL)).toBe(0);
    expect(badgeCount(signupGroup, STATUS.UNCHANGED)).toBe(1);
  });

  it("buckets a baseline-less (PENDING) variant into noBaseline, not ok", () => {
    const withNoBaseline: VisualTestItem[] = [
      ...groupTests,
      {
        name: "login-form",
        viewport: "375x667",
        browser: "chrome",
        latestStatus: "PENDING",
      },
    ];

    const testsRef = ref(withNoBaseline);
    const { groups } = useVisualTestsTable({ tests: testsRef });

    const loginGroup = groups.value.find((g) => g.name === "login-form");
    expect(badgeCount(loginGroup, STATUS.PENDING)).toBe(1);
    expect(badgeCount(loginGroup, STATUS.UNCHANGED)).toBe(1);
    expect(badgeCount(loginGroup, STATUS.PENDING_APPROVAL)).toBe(1);
  });

  it("items are sorted with pending first", () => {
    const testsRef = ref(groupTests);
    const { groups } = useVisualTestsTable({ tests: testsRef });

    const loginGroup = groups.value.find((g) => g.name === "login-form");
    expect(loginGroup!.items[0].latestStatus).toBe("PENDING_APPROVAL");
    expect(loginGroup!.items[1].latestStatus).toBe("UNCHANGED");
  });

  it("groups respect the active filters", () => {
    const testsRef = ref(groupTests);
    const { groups, filters } = useVisualTestsTable({ tests: testsRef });

    filters.value.search = "dashboard";

    expect(groups.value).toHaveLength(1);
    expect(groups.value[0].name).toBe("dashboard");
  });

  it("handles undefined name as 'Unnamed test'", () => {
    const testsWithUndefined = [
      { name: undefined, latestStatus: "UNCHANGED" },
      { name: undefined, latestStatus: "PENDING_APPROVAL" },
      { name: "valid-test", latestStatus: "UNCHANGED" },
    ] as VisualTestItem[];

    const testsRef = ref(testsWithUndefined);
    const { groups } = useVisualTestsTable({ tests: testsRef });

    const unnamedGroup = groups.value.find((g) => g.name === "Unnamed test");
    expect(unnamedGroup).toBeDefined();
    expect(unnamedGroup!.items).toHaveLength(2);
    expect(badgeCount(unnamedGroup, STATUS.PENDING_APPROVAL)).toBe(1);
    expect(badgeCount(unnamedGroup, STATUS.UNCHANGED)).toBe(1);
  });

  it("handles empty test array", () => {
    const testsRef = ref<VisualTestItem[]>([]);
    const { groups } = useVisualTestsTable({ tests: testsRef });

    expect(groups.value).toHaveLength(0);
  });

  it("generates defaultAccordionValues from group names", () => {
    const testsRef = ref(groupTests);
    const { defaultAccordionValues } = useVisualTestsTable({
      tests: testsRef,
    });

    expect(defaultAccordionValues.value).toHaveLength(3);
    expect(defaultAccordionValues.value).toContain("login-form");
    expect(defaultAccordionValues.value).toContain("signup-page");
    expect(defaultAccordionValues.value).toContain("dashboard");
  });

  it("updates groups when tests change", () => {
    const testsRef = ref(groupTests.slice(0, 2));
    const { groups } = useVisualTestsTable({ tests: testsRef });

    expect(groups.value).toHaveLength(1);

    testsRef.value = groupTests;

    expect(groups.value).toHaveLength(3);
  });

  it("handles all pending items", () => {
    const allPending = [
      { name: "test1", latestStatus: "PENDING_APPROVAL" },
      { name: "test1", latestStatus: "PENDING_APPROVAL" },
    ] as VisualTestItem[];

    const testsRef = ref(allPending);
    const { groups } = useVisualTestsTable({ tests: testsRef });

    const group = groups.value[0];
    expect(badgeCount(group, STATUS.PENDING_APPROVAL)).toBe(2);
    expect(badgeCount(group, STATUS.UNCHANGED)).toBe(0);
    expect(group.items[0].latestStatus).toBe("PENDING_APPROVAL");
  });

  it("handles all approved items", () => {
    const allApproved = [
      { name: "test1", latestStatus: "UNCHANGED" },
      { name: "test1", latestStatus: "UNCHANGED" },
    ] as VisualTestItem[];

    const testsRef = ref(allApproved);
    const { groups } = useVisualTestsTable({ tests: testsRef });

    const group = groups.value[0];
    expect(badgeCount(group, STATUS.PENDING_APPROVAL)).toBe(0);
    expect(badgeCount(group, STATUS.UNCHANGED)).toBe(2);
  });
});
