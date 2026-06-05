#!/usr/bin/env node
/** Run a Python script from backend/ (cross-platform). */
const { spawnSync } = require('child_process');
const path = require('path');

const script = process.argv[2];
if (!script) {
  console.error('Usage: node run-backend.js <script.py> [args...]');
  process.exit(1);
}

const backendDir = path.join(__dirname, '..', 'backend');
const scriptPath = path.join(backendDir, script);
const args = process.argv.slice(3);
const candidates = ['python', 'py', 'python3'];

for (const bin of candidates) {
  const result = spawnSync(bin, [scriptPath, ...args], {
    cwd: backendDir,
    stdio: 'inherit',
    shell: true,
  });
  if (result.status === 0) process.exit(0);
  if (result.error?.code !== 'ENOENT') process.exit(result.status ?? 1);
}

console.error('Python not found. Install Python 3.10+ and retry.');
process.exit(1);
