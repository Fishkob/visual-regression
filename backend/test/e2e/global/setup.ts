import { execSync } from 'child_process';
import * as fs from 'fs';
import * as net from 'net';
import * as path from 'path';
import { Client } from 'pg';

const STATE_FILE = path.join(__dirname, 'docker-state.json');

const REPO_ROOT = path.resolve(__dirname, '../../../..');

// The e2e suite runs against its own database and bucket on whatever Postgres
// and RustFS answer the standard ports. Sharing the server is fine; sharing the
// *data* is not, because `TestApp.resetDb()` truncates everything it can see and
// the object sweeps delete what they consider orphaned. A developer's dev stack
// keeps running, untouched, while the suite truncates `vrt_e2e`.
const E2E_DB = 'vrt_e2e';
const PG_HOST = 'localhost';
const PG_PORT = 5432;
const PG_USER = 'postgres';
const PG_PASSWORD = 'postgres';

// docker compose interpolates x-app-env for the whole file, so the required
// secrets must be present even when only the infra services are started or
// stopped. These are the values the suite's own DATABASE_URL and RUSTFS_* env
// in vitest.config.e2e.ts already assume.
const COMPOSE_ENV = {
  POSTGRES_PASSWORD: PG_PASSWORD,
  RUSTFS_ROOT_PASSWORD: 'rustfsadmin',
};

function setDockerStarted(started: boolean): void {
  fs.writeFileSync(STATE_FILE, JSON.stringify({ started }));
}

function getDockerStarted(): boolean {
  try {
    const data = fs.readFileSync(STATE_FILE, 'utf-8');
    return (JSON.parse(data) as { started: boolean }).started;
  } catch {
    return false;
  }
}

// A plain TCP connect answers "is something listening?" without caring which
// user owns the listener. `lsof -t` returned nothing for root-owned
// docker-proxy sockets, so the old guard always believed the ports were free and
// tried to start a second stack on top of the running one.
function isListening(port: number, host = '127.0.0.1'): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host });
    const done = (listening: boolean) => {
      socket.destroy();
      resolve(listening);
    };
    socket.setTimeout(1000);
    socket.once('connect', () => done(true));
    socket.once('timeout', () => done(false));
    socket.once('error', () => done(false));
  });
}

async function ensureDatabase(): Promise<void> {
  const admin = new Client({
    host: PG_HOST,
    port: PG_PORT,
    user: PG_USER,
    password: PG_PASSWORD,
    database: 'postgres',
  });
  await admin.connect();
  try {
    const existing = await admin.query(
      'SELECT 1 FROM pg_database WHERE datname = $1',
      [E2E_DB],
    );
    if (existing.rowCount === 0) {
      // Identifiers cannot be parameterized; E2E_DB is a constant in this file.
      await admin.query(`CREATE DATABASE "${E2E_DB}"`);
      console.log(`Created e2e database "${E2E_DB}"`);
    }
  } finally {
    await admin.end();
  }
}

export async function setup(): Promise<void> {
  const services = { postgres: 5432, rustfs: 9000, pdfSidecar: 3001 };
  const listening = await Promise.all(
    Object.values(services).map((port) => isListening(port)),
  );
  const allUp = listening.every(Boolean);
  const noneUp = listening.every((up) => !up);

  if (allUp) {
    console.log(
      'Postgres, RustFS and the pdf sidecar are already listening; reusing them.',
    );
    setDockerStarted(false);
  } else if (noneUp) {
    console.log('Starting Docker Compose (Postgres, RustFS, pdf-sidecar)...');
    execSync('docker compose up -d postgres rustfs pdf-sidecar', {
      cwd: REPO_ROOT,
      stdio: 'inherit',
      env: { ...process.env, ...COMPOSE_ENV },
    });
    setDockerStarted(true);

    console.log('Waiting for services to initialize...');
    execSync('sleep 25', { stdio: 'inherit' });
  } else {
    throw new Error(
      `Refusing to start a partial stack: ${JSON.stringify(services)} answered ${JSON.stringify(listening)}. ` +
        'Stop the running services (or start the missing one) and re-run the e2e suite.',
    );
  }

  await ensureDatabase();

  console.log(`Applying database schema to "${E2E_DB}"...`);
  execSync('npx prisma migrate deploy', {
    stdio: 'inherit',
    env: {
      ...process.env,
      POSTGRES_HOST: PG_HOST,
      POSTGRES_PORT: String(PG_PORT),
      POSTGRES_USER: PG_USER,
      POSTGRES_PASSWORD: PG_PASSWORD,
      POSTGRES_DB: E2E_DB,
    },
  });

  console.log('Environment is ready.');
  execSync('sleep 5', { stdio: 'inherit' });
}

export function teardown(): void {
  if (getDockerStarted()) {
    console.log('Stopping and removing Docker containers started by tests...');
    execSync('docker compose down -v --remove-orphans', {
      cwd: REPO_ROOT,
      stdio: 'inherit',
      env: { ...process.env, ...COMPOSE_ENV },
    });
  } else {
    console.log('Leaving existing Docker containers running...');
  }
}
