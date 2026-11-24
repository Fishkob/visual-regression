import { describe, expect, it } from "vitest";
import type { TeamDto } from "@sdk";
import {
  mapProjectTeamAssignment,
  mapTeam,
  mapTeams,
  teamOfProject,
} from "../team.mapper";

const teamDto = (overrides: Partial<TeamDto> = {}): TeamDto => ({
  id: "t-1",
  name: "Checkout",
  createdBy: "admin",
  createdAt: "2026-10-20T10:00:00.000Z",
  members: [
    { userId: "u-1", username: "alice", role: "MEMBER" },
    { userId: "u-2", username: "bob", role: "ADMIN" },
  ],
  projects: [{ id: "p-1", name: "checkout-ui" }],
  ...overrides,
});

describe("mapTeam", () => {
  it("maps every field of a fully populated team", () => {
    expect(mapTeam(teamDto())).toEqual({
      id: "t-1",
      name: "Checkout",
      createdBy: "admin",
      createdAt: "2026-10-20T10:00:00.000Z",
      members: [
        { userId: "u-1", username: "alice", role: "MEMBER" },
        { userId: "u-2", username: "bob", role: "ADMIN" },
      ],
      projects: [{ id: "p-1", name: "checkout-ui" }],
    });
  });

  it("reads a missing creator as null rather than undefined", () => {
    const dto = { ...teamDto(), createdBy: undefined } as unknown as TeamDto;

    expect(mapTeam(dto).createdBy).toBeNull();
  });

  it("degrades an unknown role to the least privileged one", () => {
    // The role decides what the members table shows; an unknown value from a
    // newer backend must not be rendered as if it granted something.
    const dto = {
      ...teamDto(),
      members: [{ userId: "u-1", username: "alice", role: "OWNER" }],
    } as unknown as TeamDto;

    expect(mapTeam(dto).members).toEqual([
      { userId: "u-1", username: "alice", role: "VIEWER" },
    ]);
  });

  it("treats missing relations as empty lists", () => {
    const dto = {
      id: "t-1",
      name: "Checkout",
      createdAt: "2026-10-20T10:00:00.000Z",
    } as unknown as TeamDto;

    expect(mapTeam(dto)).toEqual({
      id: "t-1",
      name: "Checkout",
      createdBy: null,
      createdAt: "2026-10-20T10:00:00.000Z",
      members: [],
      projects: [],
    });
  });

  // A payload assembled by hand (or by an older backend) can leave out the
  // primitives too. The mapper is the only place that decides what "missing"
  // means, so the row never renders `undefined`.
  it("defaults missing primitives and nested rows", () => {
    const dto = {
      members: [{}, { userId: "u-1" }],
      projects: [{}],
    } as unknown as TeamDto;

    expect(mapTeam(dto)).toEqual({
      id: "",
      name: "",
      createdBy: null,
      createdAt: null,
      members: [
        { userId: "", username: "", role: "VIEWER" },
        { userId: "u-1", username: "", role: "VIEWER" },
      ],
      projects: [{ id: "", name: "" }],
    });
  });

  it("maps a list", () => {
    expect(
      mapTeams([teamDto(), teamDto({ id: "t-2", name: "Platform" })]),
    ).toHaveLength(2);
  });
});

describe("mapProjectTeamAssignment", () => {
  it("maps the assignment answer", () => {
    expect(
      mapProjectTeamAssignment({
        projectId: "p-1",
        projectName: "checkout-ui",
        teamId: "t-1",
        teamName: "Checkout",
      }),
    ).toEqual({
      projectId: "p-1",
      projectName: "checkout-ui",
      teamId: "t-1",
      teamName: "Checkout",
    });
  });

  // The owner is mandatory now (ADR-083), so a payload without one is a stale
  // wire, not a "shared" answer. The mapper degrades to empty strings rather
  // than leaking `undefined` into the copy.
  it("reads a payload without an owner as empty, not undefined", () => {
    const dto = {
      projectId: "p-1",
      projectName: "checkout-ui",
    } as never;

    expect(mapProjectTeamAssignment(dto)).toEqual({
      projectId: "p-1",
      projectName: "checkout-ui",
      teamId: "",
      teamName: "",
    });
  });
});

describe("teamOfProject", () => {
  const teams = mapTeams([
    teamDto(),
    teamDto({
      id: "t-2",
      name: "Platform",
      projects: [{ id: "p-2", name: "design-system" }],
    }),
  ]);

  it("finds the team that owns the project", () => {
    expect(teamOfProject(teams, "design-system")?.name).toBe("Platform");
  });

  it("answers null for a shared project", () => {
    expect(teamOfProject(teams, "billing-api")).toBeNull();
  });

  it("answers null when nothing is loaded yet", () => {
    expect(teamOfProject([], "checkout-ui")).toBeNull();
  });
});
