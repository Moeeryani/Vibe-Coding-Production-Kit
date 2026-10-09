// Does SIGKILL actually interrupt a Node child on Windows? (D1 crash-injection validity)
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const root = await mkdtemp(path.join(os.tmpdir(), 'sigkill-probe-'));
const childPath = '<WIN-TEMP>/d01-win-20261009b/sigchild.js';
await writeFile(childPath, `
const fs = require('fs');
setInterval(() => { try { fs.appendFileSync(process.argv[2], 't'); } catch {} }, 20);
`);
const ticks = path.join(root, 'ticks.txt');
const c = spawn(process.execPath, [childPath, ticks], { stdio: 'ignore' });
let settled = null;
c.on('exit', (code, signal) => { settled = { phase: 'exit', code, signal }; });
c.on('close', (code, signal) => { settled = { phase: 'close', code, signal }; });
await new Promise((r) => setTimeout(r, 300));
const before = await readFile(ticks, 'utf8').then((s) => s.length).catch(() => 0);
const killReturned = c.kill('SIGKILL');
await new Promise((r) => setTimeout(r, 400));
const afterEarly = await readFile(ticks, 'utf8').then((s) => s.length).catch(() => 0);
await new Promise((r) => setTimeout(r, 400));
const afterLate = await readFile(ticks, 'utf8').then((s) => s.length).catch(() => 0);
console.log(JSON.stringify({
  platform: process.platform, node: process.version,
  killReturned, exitOrCloseEvent: settled,
  ticks: { before, afterEarly, afterLate },
  childActuallyStopped: settled !== null && afterLate === afterEarly,
}, null, 1));
await rm(root, { recursive: true, force: true });
