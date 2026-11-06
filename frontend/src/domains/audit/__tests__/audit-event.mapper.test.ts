import { describe, expect, it } from "vitest";
import type { AuditEventDto, PaginatedAuditEventDto } from "@sdk";
import { AUDIT_ACTIONS } from "../audit-event.model";
import {
  AUDIT_ACTION_LABEL,
  auditActionLabel,
  auditMetadataJson,
  describeAuditMetadata,
  mapAuditEvent,
  mapAuditEventPage,
  mapAuditEvents,
} from "../audit-event.mapper";

const fullDto: AuditEventDto = {
  id: "evt-1",
  actor: "jane.doe",
  action: "approval",
  projectName: "checkout",
  testName: "checkout-flow",
  branchName: "main",
  targetType: "test",
  targetId: "test-1",
  metadata: { viewport: "1920x1080", testKind: "image" },
  createdAt: "2026-01-02T10:30:00.000Z",
};

describe("mapAuditEvent", () => {
  it("round-trips a fully populated event", () => {
    expect(mapAuditEvent(fullDto)).toEqual({
      id: "evt-1",
      actor: "jane.doe",
      action: "approval",
      projectName: "checkout",
      testName: "checkout-flow",
      branchName: "main",
      targetType: "test",
      targetId: "test-1",
      metadata: { viewport: "1920x1080", testKind: "image" },
      createdAt: "2026-01-02T10:30:00.000Z",
    });
  });

  it("normalizes every absent nullable field to null", () => {
    const event = mapAuditEvent({
      id: "evt-2",
      action: "test.delete",
      createdAt: "2026-01-02T10:30:00.000Z",
      actor: null,
      projectName: null,
      testName: null,
      branchName: null,
      targetType: null,
      targetId: null,
      metadata: null,
    });

    expect(event.actor).toBeNull();
    expect(event.projectName).toBeNull();
    expect(event.testName).toBeNull();
    expect(event.branchName).toBeNull();
    expect(event.targetType).toBeNull();
    expect(event.targetId).toBeNull();
    expect(event.metadata).toBeNull();
  });

  it("treats blank and non-string identifiers as absent", () => {
    const event = mapAuditEvent({
      id: "evt-3",
      action: "project.delete",
      createdAt: "2026-01-02T10:30:00.000Z",
      actor: "",
      projectName: undefined,
      targetId: 42 as unknown as string,
    });

    expect(event.actor).toBeNull();
    expect(event.projectName).toBeNull();
    expect(event.targetId).toBeNull();
  });

  it("keeps a metadata object whose value may be nested", () => {
    const event = mapAuditEvent({
      ...fullDto,
      metadata: { filters: { status: "pending" }, screenshotCount: 3 },
    });

    expect(event.metadata).toEqual({
      filters: { status: "pending" },
      screenshotCount: 3,
    });
  });

  it("nulls metadata the wire does not carry as a JSON object", () => {
    expect(mapAuditEvent({ ...fullDto, metadata: null }).metadata).toBeNull();
    expect(
      mapAuditEvent({
        ...fullDto,
        metadata: [] as unknown as Record<string, unknown>,
      }).metadata,
    ).toBeNull();
    expect(
      mapAuditEvent({
        ...fullDto,
        metadata: "note" as unknown as Record<string, unknown>,
      }).metadata,
    ).toBeNull();
  });

  it("maps a missing list to an empty trail", () => {
    expect(mapAuditEvents(undefined)).toEqual([]);
    expect(mapAuditEvents(null)).toEqual([]);
  });

  it("preserves the newest-first wire order", () => {
    const events = mapAuditEvents([
      { ...fullDto, id: "newest" },
      { ...fullDto, id: "older" },
    ]);

    expect(events.map((event) => event.id)).toEqual(["newest", "older"]);
  });
});

describe("auditActionLabel", () => {
  it("labels every known action", () => {
    for (const action of AUDIT_ACTIONS) {
      expect(AUDIT_ACTION_LABEL[action]).toBeTruthy();
      expect(auditActionLabel(action)).toBe(AUDIT_ACTION_LABEL[action]);
    }
  });

  it("spells out deletions, restores and settings writes", () => {
    expect(auditActionLabel("approval")).toBe("Approval");
    expect(auditActionLabel("baseline.restore")).toBe("Baseline restored");
    expect(auditActionLabel("test.delete")).toBe("Test deleted");
    expect(auditActionLabel("api-key.rotate")).toBe("API key rotated");
  });

  it("labels the review and policy actions", () => {
    expect(auditActionLabel("review.assign")).toBe("Review assigned");
    expect(auditActionLabel("review.complete")).toBe("Review completed");
    expect(auditActionLabel("review.comment")).toBe("Review comment");
    expect(auditActionLabel("review.comment-resolve")).toBe(
      "Review comment resolved",
    );
    expect(auditActionLabel("test.threshold")).toBe("Threshold changed");
  });

  it("falls back to the raw value for an action added later", () => {
    expect(auditActionLabel("user.invite")).toBe("user.invite");
  });
});

describe("describeAuditMetadata", () => {
  it("compacts key/value pairs", () => {
    expect(
      describeAuditMetadata({ viewport: "1920x1080", testKind: "image" }),
    ).toBe("viewport 1920x1080 · testKind image");
  });

  it("joins arrays and keeps a nested object as JSON", () => {
    expect(
      describeAuditMetadata({
        events: ["review.requested", "comparison.approved"],
        filters: { status: "pending" },
      }),
    ).toBe(
      'events review.requested, comparison.approved · filters {"status":"pending"}',
    );
  });

  it("drops absent values instead of leaving a dangling key", () => {
    expect(
      describeAuditMetadata({ actor: null, note: "", screenshotCount: 0 }),
    ).toBe("screenshotCount 0");
  });

  it("returns an empty summary when there is no metadata", () => {
    expect(describeAuditMetadata(null)).toBe("");
    expect(describeAuditMetadata({})).toBe("");
  });
});

describe("auditMetadataJson", () => {
  it("returns the full payload as JSON", () => {
    expect(auditMetadataJson({ viewport: "1920x1080" })).toBe(
      '{"viewport":"1920x1080"}',
    );
  });

  it("returns an empty title for no metadata", () => {
    expect(auditMetadataJson(null)).toBe("");
  });
});

describe("mapAuditEventPage", () => {
  const dto: PaginatedAuditEventDto = {
    data: [fullDto],
    meta: {
      page: 2,
      limit: 50,
      total: 120,
      totalPages: 3,
      hasNextPage: true,
      hasPreviousPage: true,
    },
  };

  it("maps the rows and the pagination meta", () => {
    const page = mapAuditEventPage(dto);

    expect(page.items).toHaveLength(1);
    expect(page.items[0]?.id).toBe("evt-1");
    expect(page).toMatchObject({
      total: 120,
      page: 2,
      limit: 50,
      totalPages: 3,
    });
  });

  it("maps a missing payload to an empty first page", () => {
    expect(mapAuditEventPage(undefined)).toEqual({
      items: [],
      total: 0,
      page: 1,
      limit: 0,
      totalPages: 0,
    });
  });
});
