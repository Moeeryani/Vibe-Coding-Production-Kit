import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// 'dev' is excluded from the published package but must still be syntax-checked: moving
// harnesses out of scripts/ silently dropped five modules from this gate.
const roots = ['bin', 'lib', 'scripts', 'dev'];
const files = [];

async function walk(relativeDir) {
  const absoluteDir = path.join(root, relativeDir);
  for (const entry of await readdir(absoluteDir, { withFileTypes: true })) {
    const relative = path.join(relativeDir, entry.name);
    if (entry.isDirectory()) await walk(relative);
    else if (entry.isFile() && entry.name.endsWith('.mjs')) files.push(relative);
  }
}

for (const relativeDir of roots) await walk(relativeDir);
files.sort();

for (const relative of files) {
  const result = spawnSync(process.execPath, ['--check', path.join(root, relative)], { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

console.log(`Syntax check passed for ${files.length} module(s).`);
