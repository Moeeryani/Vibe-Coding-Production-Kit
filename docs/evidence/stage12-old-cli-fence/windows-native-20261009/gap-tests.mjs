// Focused gap tests: does old init --force bypass a v2 manifest's reader fence?
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const CLI = process.env.D01_CLI_BIN;
const MARKER = 'USER_POST_BACKUP_EDIT_MUST_SURVIVE=true';
const ID = '2026-01-01T00-00-00-000Z-a0000000';

async function fixture(name) {
  const root = path.join(await mkdtemp(path.join(process.env.D01_SCRATCH_ROOT || os.tmpdir(), 'd01-gap-')), name);
  await mkdir(root, { recursive: true });
  const init = spawnSync(process.execPath, [CLI, 'init', root, '--yes', '--no-github'], { cwd: root, encoding: 'utf8', env: { ...process.env, CI: 'true' } });
  if (init.status !== 0) throw new Error('baseline failed: ' + init.stderr);
  const mf = path.join(root, '.vcp', 'manifest.json');
  const v1 = JSON.parse(await readFile(mf, 'utf8'));
  const original = await readFile(path.join(root, 'AGENTS.md'));
  const files = path.join(root, '.vcp', 'backups', ID, 'files');
  await mkdir(files, { recursive: true });
  await writeFile(path.join(files, 'AGENTS.md'), original);
  await writeFile(path.join(root, '.vcp', 'backups', ID, 'manifest.json'), JSON.stringify(v1, null, 2));
  await writeFile(path.join(root, '.vcp', 'backups', ID, 'backup.json'), JSON.stringify({ id: ID, createdAt: '2026-01-01T00:00:00Z', installedVersion: '0.9.3', entries: [{ path: 'AGENTS.md', exists: true, mode: 420 }] }));
  await writeFile(mf, JSON.stringify({ ...v1, schemaVersion: 2, minimumReaderVersion: '999.0.0', install: { ...v1.install, assetSet: 'brownfield-minimal-v1' } }, null, 2));
  await writeFile(path.join(root, 'AGENTS.md'), Buffer.concat([original, Buffer.from('\n' + MARKER + '\n')]));
  return { root, mf };
}
const run = (args, cwd) => spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8', timeout: 40000, env: { ...process.env, CI: 'true', npm_config_offline: 'true' } });
const editSurvives = async (root) => (await readFile(path.join(root, 'AGENTS.md'), 'utf8').catch(() => '')).includes(MARKER);
const schema = async (root) => { try { return JSON.parse(await readFile(path.join(root, '.vcp', 'manifest.json'), 'utf8')).schemaVersion; } catch { return null; } };

const out = [];
// G1: intact v2 manifest, no sentinel -> old init --force
{
  const { root } = await fixture('g1-intact-v2-initforce');
  const r = run(['init', root, '--yes', '--no-github', '--force'], root);
  out.push({ id: 'G1', setup: 'intact schema-2 manifest, minimumReaderVersion 999.0.0, no lock', command: 'init --force',
    exitCode: r.status, stderr: (r.stderr || '').slice(-300), resultingSchema: await schema(root),
    postBackupEditSurvived: await editSurvives(root) });
}
// G2: same but with a fresh directory sentinel
{
  const { root } = await fixture('g2-sentinel-initforce');
  await mkdir(path.join(root, '.vcp', 'update.lock'));
  const r = run(['init', root, '--yes', '--no-github', '--force'], root);
  const kind = await (async () => { try { const s = await (await import('node:fs/promises')).lstat(path.join(root, '.vcp', 'update.lock')); return s.isDirectory() ? 'directory' : 'regular-file'; } catch { return 'absent'; } })();
  out.push({ id: 'G2', setup: 'intact schema-2 manifest + fresh directory sentinel', command: 'init --force',
    exitCode: r.status, stderr: (r.stderr || '').slice(-300), sentinelAfter: kind,
    resultingSchema: await schema(root), postBackupEditSurvived: await editSurvives(root) });
}
// G3: same but with a live v2-shaped regular-file lock written by this harness
{
  const { root, mf } = await fixture('g3-v2lock-initforce');
  const holder = spawnSync(process.execPath, ['-e', 'setTimeout(()=>{},5000)'], { detached: true });
  const lock = path.join(root, '.vcp', 'update.lock');
  await writeFile(lock, JSON.stringify({ version: 2, mode: 'update', pid: process.pid, host: os.hostname(), token: 'd'.repeat(48), startedAt: new Date().toISOString() }));
  const r = run(['init', root, '--yes', '--no-github', '--force'], root);
  const raw = await readFile(lock, 'utf8').catch(() => null);
  out.push({ id: 'G3', setup: 'intact schema-2 manifest + v2-shaped lock held by a live pid', command: 'init --force',
    exitCode: r.status, stderr: (r.stderr || '').slice(-300), lockAfterInit: raw,
    resultingSchema: await schema(root), postBackupEditSurvived: await editSurvives(root) });
}
// G4: rollback with intact v2 manifest (control for the version fence)
{
  const { root } = await fixture('g4-intact-v2-rollback');
  const r = run(['rollback', root], root);
  out.push({ id: 'G4', setup: 'intact schema-2 manifest', command: 'rollback', exitCode: r.status,
    stderr: (r.stderr || '').slice(-300), resultingSchema: await schema(root), postBackupEditSurvived: await editSurvives(root) });
}
console.log(JSON.stringify(out, null, 1));
await rm(path.dirname(out.__dirname || ''), { recursive: true, force: true }).catch(() => {});
