import { describe, expect, it } from "vitest";

import router from "@/router/index";
import { QUALITY_CASES } from "../../tests/quality/cases";

// The gallery is the only surface that gets a pixel baseline and an axe scan in
// both themes, and nothing forced a new page into it: the a11y gate silently
// covered 12 of 21 routes while the docs said "every gallery story". This test
// makes the decision explicit — a route is either backed by a quality case or
// listed below with the reason it is not, and adding a route fails the suite
// until one of the two is written.
const ROUTE_CASES: Record<string, string[]> = {
  login: ["login"],
  "review-inbox": ["inbox"],
  "project-list": [
    "projects",
    "app-shell",
    "projects-new-dialog",
    "search-palette",
  ],
  groups: ["groups"],
  "change-password": ["change-password"],
  users: ["users"],
  forbidden: ["forbidden"],
  security: ["security"],
  "api-keys": ["api-keys"],
  audit: ["audit"],
  "project-detail": ["project-detail"],
  "project-settings": ["project-settings", "storage-preview-dialog"],
  "project-webhooks": ["webhooks"],
  "project-runs": ["runs"],
  "run-detail": ["run-detail"],
  "project-trends": ["trends"],
  // One route, two kinds: the dispatcher renders the image or the PDF view.
  "test-detail": [
    "visual-test-details",
    "visual-test-details-regions",
    "pdf-test-details",
  ],
  "test-overview": ["test-overview"],
  "approval-done": ["approval-done"],
  "not-found": ["not-found"],
  // Rendered outside the shell, which is why it stayed un-gated the longest: the
  // public resolve endpoint answers a free-form payload, so its case builds the
  // fixture against the mapper's source type.
  share: ["share"],
  // The one-time account invitation, also outside the shell — same reason.
  invite: ["invite"],
};

// Routes without a case, each with the reason it has none. Empty on purpose:
// every route is photographed and scanned in both themes today. A new route
// needs a case above — or an entry here that says why not, which the suite
// keeps up to date.
const NOT_IN_GALLERY: Record<string, string> = {};

const routeNames = router
  .getRoutes()
  .map((route) => route.name)
  .filter((name): name is string => typeof name === "string");

describe("gallery coverage", () => {
  it("gives every route either a quality case or a documented opt-out", () => {
    const uncovered = routeNames.filter(
      (name) => !(name in ROUTE_CASES) && !(name in NOT_IN_GALLERY),
    );

    expect(uncovered).toEqual([]);
  });

  it("does not keep a case or an opt-out for a route that no longer exists", () => {
    const stale = [
      ...Object.keys(ROUTE_CASES),
      ...Object.keys(NOT_IN_GALLERY),
    ].filter((name) => !routeNames.includes(name));

    expect(stale).toEqual([]);
  });

  it("does not list a route as both covered and opted out", () => {
    const both = Object.keys(ROUTE_CASES).filter(
      (name) => name in NOT_IN_GALLERY,
    );

    expect(both).toEqual([]);
  });

  it.each(Object.entries(NOT_IN_GALLERY))(
    "states why %s has no gallery case",
    (_route, reason) => {
      expect(reason.length).toBeGreaterThan(20);
    },
  );

  it("only points at cases that exist", () => {
    const caseNames = new Set(
      QUALITY_CASES.map((qualityCase) => qualityCase.name),
    );
    const missing = Object.values(ROUTE_CASES)
      .flat()
      .filter((name) => !caseNames.has(name));

    expect(missing).toEqual([]);
  });

  it("leaves no case without a route", () => {
    const referenced = new Set(Object.values(ROUTE_CASES).flat());
    const orphans = QUALITY_CASES.map((qualityCase) => qualityCase.name).filter(
      (name) => !referenced.has(name),
    );

    expect(orphans).toEqual([]);
  });

  it("names every case uniquely", () => {
    const names = QUALITY_CASES.map((qualityCase) => qualityCase.name);

    expect(new Set(names).size).toBe(names.length);
  });

  it("states why a case is scanned but not photographed", () => {
    // The visual spec skips these, so the reason is the only record that the
    // omission was a decision. Same rule as NOT_IN_GALLERY above.
    for (const qualityCase of QUALITY_CASES) {
      if (qualityCase.scanOnly === undefined) continue;
      expect(qualityCase.scanOnly.length, qualityCase.name).toBeGreaterThan(20);
    }
  });

  it("sends every overlay case through the click that opens it", () => {
    // An overlay case is worthless if nothing brings the overlay into view:
    // axe would scan the page behind it and report a clean bill of health. The
    // pair is enforced by the type, so what is left to assert is that the walk
    // actually reaches one.
    const overlays = QUALITY_CASES.filter(
      (qualityCase) => qualityCase.openTestId !== undefined,
    );

    expect(overlays.length).toBeGreaterThan(0);
    for (const overlay of overlays) {
      expect(overlay.overlayTestId, overlay.name).toBeTruthy();
    }
  });
});
