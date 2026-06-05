#!/usr/bin/env node
/**
 * Install Python backend dependencies (cross-platform).
 * Tries: python -m pip, py -m pip, python3 -m pip
 */
const { spawnSync } = require('child_process');
const path = require('path');

const reqFile = path.join(__dirname, '..', 'backend', 'requirements.txt');
const candidates = [
  ['python', '-m', 'pip', 'install', '-r', reqFile],
  ['py', '-m', 'pip', 'install', '-r', reqFile],
  ['python3', '-m', 'pip', 'install', '-r', reqFile],
];

for (const cmd of candidates) {
  const result = spawnSync(cmd[0], cmd.slice(1), { stdio: 'inherit', shell: true });
  if (result.status === 0) {
    console.log('Backend Python dependencies installed.');
    process.exit(0);
  }
}

console.warn(
  'Warning: Python not found. Backend scripts require Python 3.10+.\n' +
    'Install Python from https://python.org then run: npm run install:backend',
);
process.exit(0);
