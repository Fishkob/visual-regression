import type { DemoUserSeed } from './fixtures';

export interface DemoTeamFixtures {
  readonly demoProjects: readonly string[];
  readonly users: readonly DemoUserSeed[];
  readonly teams: Readonly<Record<string, readonly string[]>>;
  readonly sharedProjects: readonly string[];
}

export interface TeamSeedPlan {
  readonly users: readonly DemoUserSeed[];
  readonly teams: readonly {
    readonly name: string;
    readonly projectNames: readonly string[];
    readonly usernames: readonly string[];
  }[];
  readonly sharedProjects: readonly string[];
}

/**
 * Turns the demo fixtures into "which team owns which project, who belongs to
 * it", and refuses a fixture set that leaves a demo project unowned: ownership is
 * mandatory (ADR-083), so an unaccounted project would keep whatever team a
 * previous run left on it and the demo would silently lose a state. Being
 * *shared* is a property on top of an owner, not an alternative to one — a
 * project can be owned by `general` and still visible to everyone. The seeder
 * resolves the plan before it touches the database, which is what makes a broken
 * fixture a failed run instead of a half-applied one.
 */
export function buildTeamPlan(fixtures: DemoTeamFixtures): TeamSeedPlan {
  const owner = new Map<string, string>();

  for (const [team, projectNames] of Object.entries(fixtures.teams)) {
    for (const project of projectNames) {
      if (!fixtures.demoProjects.includes(project)) {
        throw new Error(
          `Team "${team}" names project "${project}", which is not one of the demo projects (${fixtures.demoProjects.join(', ')}).`,
        );
      }
      const previous = owner.get(project);
      if (previous) {
        throw new Error(
          `Project "${project}" is owned by both "${previous}" and "${team}".`,
        );
      }
      owner.set(project, team);
    }
  }

  for (const project of fixtures.sharedProjects) {
    if (!fixtures.demoProjects.includes(project)) {
      throw new Error(
        `DEMO_SHARED_PROJECTS names project "${project}", which is not one of the demo projects.`,
      );
    }
    if (!owner.has(project)) {
      throw new Error(
        `DEMO_SHARED_PROJECTS names project "${project}", which no team owns — a shared project still has an owner (ADR-083).`,
      );
    }
  }

  const unaccounted = fixtures.demoProjects.filter(
    (project) => !owner.has(project),
  );
  if (unaccounted.length > 0) {
    throw new Error(
      `Demo project(s) ${unaccounted.join(', ')} belong to no team — add them to DEMO_TEAMS.`,
    );
  }

  const teamNames = new Set(Object.keys(fixtures.teams));
  for (const user of fixtures.users) {
    for (const team of user.teams) {
      if (!teamNames.has(team)) {
        throw new Error(
          `Demo user "${user.username}" names team "${team}", which DEMO_TEAMS does not define.`,
        );
      }
    }
  }

  return {
    users: fixtures.users,
    sharedProjects: fixtures.sharedProjects,
    teams: Object.entries(fixtures.teams).map(([name, projectNames]) => ({
      name,
      projectNames,
      usernames: fixtures.users
        .filter((user) => user.teams.includes(name))
        .map((user) => user.username),
    })),
  };
}
