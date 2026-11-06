import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const STATE_FILE = path.join(__dirname, 'docker-state.json');

function getDockerStarted(): boolean {
  try {
    const data = fs.readFileSync(STATE_FILE, 'utf-8');
    return (JSON.parse(data) as { started: boolean }).started;
  } catch {
    return false;
  }
}

module.exports = () => {
  if (getDockerStarted()) {
    console.log('Stopping and removing Docker containers started by tests...');
    // docker compose interpolates x-app-env before it removes anything, so the
    // required secrets have to be set here too.
    execSync('docker compose down -v --remove-orphans', {
      stdio: 'inherit',
      env: {
        ...process.env,
        POSTGRES_PASSWORD: 'postgres',
        RUSTFS_ROOT_PASSWORD: 'rustfsadmin',
      },
    });
  } else {
    console.log('Leaving existing Docker containers running...');
  }
};
