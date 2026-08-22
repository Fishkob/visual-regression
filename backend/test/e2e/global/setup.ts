import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const STATE_FILE = path.join(__dirname, 'docker-state.json');

const REPO_ROOT = path.resolve(__dirname, '../../../..');

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

export function setup(): void {
  console.log('Checking if Docker services are already running...');

  const checkPort = (port: number): boolean => {
    try {
      execSync(`lsof -i :${port} -sTCP:LISTEN -t`, { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  };

  const isPostgresRunning = checkPort(5432);
  const isRustfsRunning = checkPort(9000);
  const isPdfSidecarRunning = checkPort(3001);

  if (isPostgresRunning && isRustfsRunning && isPdfSidecarRunning) {
    console.log('Docker services already running, skipping docker-compose...');
    setDockerStarted(false);
  } else {
    console.log('Starting Docker Compose (Postgres, RustFS, pdf-sidecar)...');
    execSync('docker compose up -d postgres rustfs pdf-sidecar', {
      cwd: REPO_ROOT,
      stdio: 'inherit',
    });
    setDockerStarted(true);

    console.log('Waiting for services to initialize...');
    execSync('sleep 25', { stdio: 'inherit' });
  }

  console.log('Applying database schema...');
  execSync('npx prisma migrate deploy', {
    stdio: 'inherit',
    env: {
      ...process.env,
      POSTGRES_HOST: 'localhost',
      POSTGRES_PORT: '5432',
      POSTGRES_USER: 'postgres',
      POSTGRES_PASSWORD: 'postgres',
      POSTGRES_DB: 'vrt',
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
    });
  } else {
    console.log('Leaving existing Docker containers running...');
  }
}
