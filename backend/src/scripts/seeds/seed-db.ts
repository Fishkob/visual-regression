import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@/prisma/client';

/**
 * The database the backend itself reads, so rows a seeder writes are the ones
 * the running API serves.
 *
 * `prisma.config.ts` builds its URL from the POSTGRES_* variables instead, so
 * those are the fallback: a Docker installation passes them to the seeder from
 * its `.env` (which carries no DATABASE_URL, because compose injects the
 * container-internal one). `SEED_DATABASE_URL` is the override for a host/port
 * that fits neither.
 */
export function resolveDatabaseUrl(): string {
  const explicit = process.env.SEED_DATABASE_URL?.trim();
  if (explicit) return explicit;

  const runtime = process.env.DATABASE_URL?.trim();
  if (runtime) return runtime;

  const {
    POSTGRES_HOST,
    POSTGRES_PORT,
    POSTGRES_USER,
    POSTGRES_PASSWORD,
    POSTGRES_DB,
  } = process.env;
  if (POSTGRES_USER && POSTGRES_PASSWORD && POSTGRES_DB) {
    const host = POSTGRES_HOST?.trim() || 'localhost';
    const port = POSTGRES_PORT?.trim() || '5432';
    return `postgresql://${encodeURIComponent(POSTGRES_USER)}:${encodeURIComponent(
      POSTGRES_PASSWORD,
    )}@${host}:${port}/${POSTGRES_DB}`;
  }

  throw new Error(
    'No database configured: set DATABASE_URL (what the backend reads), the POSTGRES_* variables (what prisma.config.ts reads), or SEED_DATABASE_URL. The seed scripts do not load backend/.env.local themselves — ./scripts/dev.sh seed passes them, a direct `pnpm run seed:teams` needs them exported.',
  );
}

export function describeSeedTarget(connectionString: string): string {
  try {
    const url = new URL(connectionString);
    return `${url.hostname}:${url.port || '5432'}${url.pathname}`;
  } catch {
    return '(unparseable connection string)';
  }
}

export function createSeedClient(): PrismaClient {
  return new PrismaClient({
    adapter: new PrismaPg({
      connectionString: resolveDatabaseUrl(),
      max: 2,
      // `PrismaConnection` pins UTC for the same reason: DateTime columns are
      // `timestamp(3)` without a zone, so a server-local timezone would store
      // wall time in columns the schema treats as UTC.
      options: '-c timezone=UTC',
    }),
  });
}

// A name that is obviously the seeder's, so an operator who sees it knows where
// it came from. `seed:teams` reassigns the demo projects to their real owners
// afterwards; e2e and dev projects keep this one.
export const SEED_DEFAULT_TEAM = 'general';

/**
 * The team a REST seeder puts its projects in.
 *
 * Every project has an owner (ADR-083), but team administration is
 * `@Roles('ADMIN')` **and** `@SessionOnly()` — a seeder that only holds an API
 * key cannot create one (`403`). The seeder therefore writes this one row
 * through Prisma, the same way `seed:teams` writes users, teams and ownership:
 * it is the smallest possible exception, and it keeps the seeder from logging in
 * as a human admin whose password is one-time or already rotated.
 *
 * Idempotent by the unique name, so a repeated `dev.sh seed` reuses the team.
 */
export async function ensureSeedTeam(
  name: string = SEED_DEFAULT_TEAM,
): Promise<{ id: string; name: string }> {
  const prisma = createSeedClient();
  try {
    return await prisma.team.upsert({
      where: { name },
      create: { name, createdBy: 'seeder' },
      update: {},
      select: { id: true, name: true },
    });
  } finally {
    await prisma.$disconnect();
  }
}
