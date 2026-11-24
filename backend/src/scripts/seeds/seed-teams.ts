import { hashPassword } from '@internal/auth/password-hasher';
import { PrismaClient } from '@/prisma/client';
import {
  DEMO_SHARED_PROJECTS,
  DEMO_TEAMS,
  DEMO_USERS,
  DEMO_USER_PASSWORD,
  PROJECT_NAMES,
} from './fixtures';
import {
  buildTeamPlan,
  type DemoTeamFixtures,
  type TeamSeedPlan,
} from './team-plan';
import {
  createSeedClient,
  describeSeedTarget,
  resolveDatabaseUrl,
} from './seed-db';
/**
 * Team Seeder - seeds the multi-team demo (ADR-082, ADR-083)
 * - Demo users, three teams, every demo project owned, one of them also shared
 * - Writes users, teams and `Project.teamId` through Prisma, not through the
 *   admin API: both surfaces are `@SessionOnly` + `@Roles('ADMIN')` by design,
 *   and a seeder must not log in as a human admin whose password is either
 *   one-time (the bootstrap admin) or already rotated
 * - Needs the projects `seed-demo` creates, so it runs last in `seed:all`
 * - Idempotent and self-healing: it upserts by name/username, replaces each
 *   member set and re-states every demo project's team, so a hand-edited demo
 *   is repaired by the next run instead of accumulating
 */

const DEMO_TEAM_FIXTURES: DemoTeamFixtures = {
  demoProjects: PROJECT_NAMES.DEMO,
  users: DEMO_USERS,
  teams: DEMO_TEAMS,
  sharedProjects: DEMO_SHARED_PROJECTS,
};

async function assertDemoProjects(
  prisma: PrismaClient,
  plan: TeamSeedPlan,
): Promise<void> {
  const names = [
    ...new Set([
      ...plan.teams.flatMap((team) => [...team.projectNames]),
      ...plan.sharedProjects,
    ]),
  ];
  const rows = await prisma.project.findMany({
    where: { name: { in: names } },
    select: { name: true },
  });
  const found = new Set(rows.map((row) => row.name));
  const missing = names.filter((name) => !found.has(name));

  if (missing.length > 0) {
    throw new Error(
      `Missing demo project(s): ${missing.join(', ')}. This seeder needs the projects the demo seed creates — run ./scripts/dev.sh seed (or pnpm run seed:demo) first.`,
    );
  }
}

async function seedUsers(
  prisma: PrismaClient,
  plan: TeamSeedPlan,
  passwordHash: string,
): Promise<Map<string, string>> {
  const ids = new Map<string, string>();

  for (const user of plan.users) {
    const row = await prisma.user.upsert({
      where: { username: user.username },
      create: {
        username: user.username,
        passwordHash,
        role: user.role,
        mustChangePassword: false,
      },
      update: {
        passwordHash,
        role: user.role,
        mustChangePassword: false,
        isActive: true,
        deactivatedAt: null,
      },
    });
    // The password was just replaced, so a session opened with the previous one
    // must not survive the seed.
    await prisma.session.deleteMany({ where: { userId: row.id } });

    ids.set(user.username, row.id);
    console.log(`  User "${user.username}" (${user.role}) ready`);
  }

  return ids;
}

async function seedTeams(
  prisma: PrismaClient,
  plan: TeamSeedPlan,
  userIds: ReadonlyMap<string, string>,
): Promise<void> {
  for (const team of plan.teams) {
    const row = await prisma.team.upsert({
      where: { name: team.name },
      create: { name: team.name },
      update: {},
    });

    await prisma.$transaction(async (tx) => {
      await tx.teamMember.deleteMany({ where: { teamId: row.id } });
      if (team.usernames.length > 0) {
        await tx.teamMember.createMany({
          data: team.usernames.map((username) => ({
            teamId: row.id,
            userId: userIds.get(username)!,
          })),
        });
      }
      // Claim its fixture projects. There is no "release" any more: a project
      // always has an owner (ADR-083), and the plan covers every demo project
      // exactly once, so a project that moved between fixtures is claimed by its
      // new team instead of being left unowned.
      await tx.project.updateMany({
        where: { name: { in: [...team.projectNames] } },
        data: { teamId: row.id },
      });
    });

    const projects = team.projectNames.join(', ');
    const members = team.usernames.join(', ') || '(no members)';
    console.log(`  Team "${team.name}" -> ${projects} [${members}]`);
  }

  // The flag is stated after every ownership, and for every demo project, so a
  // project that left DEMO_SHARED_PROJECTS loses it: "owned by its team" and
  // "visible to everyone" are two properties, and only one of them moved.
  const owned = plan.teams.flatMap((team) => [...team.projectNames]);
  await prisma.project.updateMany({
    where: { name: { in: owned } },
    data: { isShared: false },
  });
  await prisma.project.updateMany({
    where: { name: { in: [...plan.sharedProjects] } },
    data: { isShared: true },
  });
}

async function seed(): Promise<void> {
  const plan = buildTeamPlan(DEMO_TEAM_FIXTURES);
  const connectionString = resolveDatabaseUrl();
  const prisma = createSeedClient();

  console.log(
    `Seeding TEAM demo data directly into ${describeSeedTarget(connectionString)}...\n`,
  );

  try {
    await assertDemoProjects(prisma, plan);

    const password = process.env.SEED_DEMO_USER_PASSWORD ?? DEMO_USER_PASSWORD;
    const passwordHash = await hashPassword(password);
    const userIds = await seedUsers(prisma, plan, passwordHash);
    await seedTeams(prisma, plan, userIds);

    console.log('\nTeam seeding complete!');
    console.log(
      `  Shared (owned, but every signed-in user may read): ${plan.sharedProjects.join(', ')}`,
    );
    console.log(
      `  Demo logins: ${plan.users.map((user) => user.username).join(', ')} — password "${password}"`,
    );
    console.log(
      '  The project scope is resolved per request, so a running backend needs no restart.',
    );
    console.log(
      '  These rows carry no audit entry: they are written through Prisma, not the admin API.',
    );
  } finally {
    await prisma.$disconnect();
  }
}

seed().catch((err: unknown) => {
  console.error('Seeding failed:', (err as Error).message);
  process.exit(1);
});
