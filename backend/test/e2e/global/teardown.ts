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
    execSync('docker compose down -v --remove-orphans', { stdio: 'inherit' });
  } else {
    console.log('Leaving existing Docker containers running...');
  }
};
