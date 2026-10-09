// D-01 Windows adversarial pass 2: manifest-absence matrix (old entrypoints),
// journal/backup destruction by old init, and re-run of reparse/case tests.
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import {
  lstat, mkdir, mkdtemp, readFile, readlink, readdir, rm, utimes, writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const CLI_BIN = process.env.D01_CLI_BIN;
const REPO = process.env.D01_REPO;
const PKG = process.env.D01_PKG_DIR;
const EVIDENCE = process.env.D01_EVIDENCE_DIR;
const MARKER = 'USER_POST_BACKUP_EDIT_MUST_SURVIVE=true';
const ID_OLD = '2026-01-01T00-00-00-000Z-a0000000';
const results = [];
let SCRATCH;
const sha = (b) => createHash('sha256').update(b).digest('hex');

function run(bin, args, cwd, timeout = 40000) {
  const r = spawnSync(process.execPath, [bin, ...args], {
    cwd, encoding: 'utf8', timeout, maxBuffer: 1 << 20,
    env: { ...process.env, CI: 'true', npm_config_offline: 'true' },
  });
  return { args, exitCode: r.status, signal: r.signal, stdout: (r.stdout ?? '').slice(-1200), stderr: (r.stderr ?? '').slice(-1200) };
}
async function snapshot(root) {
  const out = new Map();
  async function walk(dir, parent = '') {
    let entries = [];
    try { entries = (await readdir(dir, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name)); }
    catch (e) { out.set(parent + '/', 'vanished:' + e.code); return; }
    for (const item of entries) {
      const rel = parent ? `${parent}/${item.name}` : item.name;
      if (rel === '.vcp/update.lock') continue;
      const target = path.join(dir, item.name);
      let s; try { s = await lstat(target); } catch (e) { out.set(rel, 'raced:' + e.code); continue; }
      try {
        if (s.isSymbolicLink()) out.set(rel, 'link:' + await readlink(target));
        else if (s.isDirectory()) { out.set(rel + '/', 'dir'); await walk(target, rel); }
        else if (s.isFile()) out.set(rel, 'file:' + sha(await readFile(target)));
        else out.set(rel, 'special:' + s.mode);
      } catch (e) { out.set(rel, 'raced:' + e.code); }
    }
  }
  await walk(root);
  return out;
}
const changed = (b, a) => [...new Set([...b.keys(), ...a.keys()])].sort().filter((k) => b.get(k) !== a.get(k));
async function lockKind(root) {
  try { const s = await lstat(path.join(root, '.vcp', 'update.lock')); return s.isDirectory() ? 'directory' : s.isFile() ? 'regular-file' : 'other'; }
  catch (e) { return e.code === 'ENOENT' ? 'absent' : 'error:' + e.code; }
}
async function edit(root) { try { return (await readFile(path.join(root, 'AGENTS.md'), 'utf8')).includes(MARKER); } catch { return null; } }
async function schema(root) { try { return JSON.parse(await readFile(path.join(root, '.vcp', 'manifest.json'), 'utf8')).schemaVersion; } catch { return null; } }

async function fixture(name) {
  const root = path.join(SCRATCH, 'projects', name);
  await mkdir(root, { recursive: true });
  const init = run(CLI_BIN, ['init', root, '--yes', '--no-github'], root, 60000);
  if (init.exitCode !== 0) throw new Error('baseline init failed: ' + init.stderr);
  const mfPath = path.join(root, '.vcp', 'manifest.json');
  const v1 = JSON.parse(await readFile(mfPath, 'utf8'));
  const original = await readFile(path.join(root, 'AGENTS.md'));
  const v2 = { ...v1, schemaVersion: 2, minimumReaderVersion: '999.0.0', install: { ...v1.install, assetSet: 'brownfield-minimal-v1' } };
  const files = path.join(root, '.vcp', 'backups', ID_OLD, 'files');
  await mkdir(files, { recursive: true });
  await writeFile(path.join(files, 'AGENTS.md'), original);
  await writeFile(path.join(root, '.vcp', 'backups', ID_OLD, 'manifest.json'), JSON.stringify(v1, null, 2) + '\n');
  await writeFile(path.join(root, '.vcp', 'backups', ID_OLD, 'backup.json'), JSON.stringify({
    id: ID_OLD, createdAt: '2026-01-01T00:00:00Z', installedVersion: '0.9.3',
    entries: [{ path: 'AGENTS.md', exists: true, mode: 420 }],
  }, null, 2) + '\n');
  await writeFile(mfPath, JSON.stringify(v2, null, 2) + '\n');
  await writeFile(path.join(root, 'AGENTS.md'), Buffer.concat([original, Buffer.from(`\n${MARKER}\n`)]));
  return { root, mfPath, v1, v2, original };
}

// A v2-shaped crash journal (formatVersion 2), as the future writer would leave it.
async function putV2Journal(root, phase = 'applying') {
  const tx = {
    formatVersion: 2, transactionSchemaVersion: 2, minimumReaderVersion: '0.9.4',
    operation: 'update', id: 'op-2026-0001', operationId: 'op-2026-0001', backupId: 'op-2026-0001',
    phase, startedAt: new Date().toISOString(),
    plannedManifestHash: 'a'.repeat(64),
  };
  await writeFile(path.join(root, '.vcp', 'transaction.json'), JSON.stringify(tx, null, 2) + '\n');
  const dir = path.join(root, '.vcp', 'backups', 'op-2026-0001');
  await mkdir(path.join(dir, 'files'), { recursive: true });
  await writeFile(path.join(dir, 'backup.json'), JSON.stringify({
    formatVersion: 2, backupSchemaVersion: 2, minimumReaderVersion: '0.9.4',
    restoredManifestHash: 'a'.repeat(64), id: 'op-2026-0001', operationId: 'op-2026-0001',
    operation: 'update', priorVcpDirectoryExisted: true, priorManifestExisted: true,
    priorBaselinesExisted: true, priorInstalledVersion: '0.9.3',
    lockBootstrapCreatedVcpDirectory: false, entries: [{ path: 'AGENTS.md', exists: true, mode: 420 }],
  }, null, 2) + '\n');
  return tx;
}

async function manifestCase(label, mutate, cmdArgs) {
  const { root, mfPath } = await fixture('manifest-' + label);
  await mutate(root, mfPath);
  const before = await snapshot(root);
  const cmd = run(CLI_BIN, cmdArgs(root), root);
  const after = await snapshot(root);
  const keys = changed(before, after);
  return {
    case: label, command: cmd.args, exitCode: cmd.exitCode,
    stderr: cmd.stderr.slice(-260), protectedChanged: keys.length,
    changedSample: keys.slice(0, 6),
    lockKindAfter: await lockKind(root), resultingSchema: await schema(root),
    postBackupEditSurvived: await edit(root),
    manifestStillAbsent: !(await existsSync(mfPath)),
    journalSurvived: existsSync(path.join(root, '.vcp', 'transaction.json')),
    v2BackupSurvived: existsSync(path.join(root, '.vcp', 'backups', 'op-2026-0001')),
    verdict: keys.length ? 'LEGACY_MUTATION' : 'REFUSED_OR_NO_CHANGE',
  };
}

async function agedEmptySentinelReclaim() {
  const { root } = await fixture('aged-empty-sentinel');
  const lock = path.join(root, '.vcp', 'update.lock');
  await mkdir(lock);
  const aged = new Date(Date.now() - 2 * 3600 * 1000);
  await utimes(lock, aged, aged);
  const cmd = run(CLI_BIN, ['rollback', root], root);
  return { status: 'EXECUTED', lockKindAfter: await lockKind(root), exitCode: cmd.exitCode,
    stderr: cmd.stderr.slice(-300), postBackupEditSurvived: await edit(root),
    verdict: (await lockKind(root)) === 'directory' ? 'SENTINEL_SURVIVED_WINDOWS_RMDIR' : 'SENTINEL_REMOVED_ON_WINDOWS' };
}

async function caseVariant() {
  const { root } = await fixture('case-variant');
  const before = await snapshot(root);
  const lowered = root.slice(0, 2) + root.slice(2).toLowerCase();
  const cmd = run(CLI_BIN, ['rollback', lowered], root);
  const after = await snapshot(root);
  return { status: 'EXECUTED', requested: lowered, actual: root, exitCode: cmd.exitCode,
    stderr: cmd.stderr.slice(-260), protectedChanged: changed(before, after).length,
    postBackupEditSurvived: await edit(root), verdict: 'OBSERVED' };
}

async function junctionProbe() {
  const { root } = await fixture('junction-probe');
  const outside = path.join(SCRATCH, 'junction-outside');
  await mkdir(outside, { recursive: true });
  await writeFile(path.join(outside, 'AGENTS.md'), 'INJECTED_FROM_OUTSIDE\n');
  const victim = path.join(outside, 'IMPORTANT_UNRELATED.txt');
  await writeFile(victim, 'DO_NOT_TOUCH\n');
  const sourceDir = path.join(root, '.vcp', 'backups', ID_OLD, 'files');
  await rm(sourceDir, { recursive: true, force: true });
  const j = spawnSync('cmd.exe', ['/c', 'mklink', '/J', sourceDir, outside], { encoding: 'utf8' });
  const parentIsDir = await lstat(path.dirname(sourceDir)).then((s) => s.isDirectory()).catch(() => false);
  const junctionExists = existsSync(path.join(sourceDir, 'AGENTS.md')) && parentIsDir;
  let isReparse = false;
  try { const s = await lstat(sourceDir); isReparse = s.isDirectory() && (Number(s.mode) & 0o170000) !== 0o040000; } catch {}
  const cmd = run(CLI_BIN, ['rollback', root], root);
  const agents = await readFile(path.join(root, 'AGENTS.md'), 'utf8').catch(() => null);
  return {
    status: 'EXECUTED', mklinkStdout: (j.stdout || '').trim().slice(0, 160), mklinkStderr: (j.stderr || '').slice(0, 160),
    junctionResolvesToOutside: junctionExists, lstatLooksLikeReparse: isReparse,
    exitCode: cmd.exitCode, stderr: cmd.stderr.slice(-300),
    injectedContentReachedProject: agents ? agents.includes('INJECTED_FROM_OUTSIDE') : null,
    outsideVictimAfter: await readFile(victim, 'utf8').catch(() => null),
    verdict: agents && agents.includes('INJECTED_FROM_OUTSIDE') ? 'JUNCTION_SOURCE_FOLLOWED' : 'JUNCTION_NOT_USED_FOR_WRITE',
  };
}

async function symlinkManagedFile() {
  const { root } = await fixture('symlink-managed');
  const outside = path.join(SCRATCH, 'symlink-target');
  await mkdir(outside, { recursive: true });
  const victim = path.join(outside, 'IMPORTANT_UNRELATED.txt');
  await writeFile(victim, 'DO_NOT_TOUCH\n');
  const managed = path.join(root, 'AGENTS.md');
  await rm(managed, { force: true });
  const mk = spawnSync('cmd.exe', ['/c', 'mklink', managed, victim], { encoding: 'utf8' });
  const isLink = await lstat(managed).then((s) => s.isSymbolicLink()).catch(() => false);
  const cmd = run(CLI_BIN, ['rollback', root], root);
  const victimAfter = await readFile(victim, 'utf8').catch(() => null);
  return {
    status: isLink ? 'EXECUTED' : 'BLOCKED', reason: isLink ? null : ('symlink unavailable: ' + (mk.stderr || '').slice(0, 160)),
    exitCode: cmd.exitCode, stderr: cmd.stderr.slice(-300),
    outsideVictimAfter: victimAfter, projectAGentsAfter: await readFile(managed, 'utf8').catch((e) => 'unreadable:' + e.code),
    verdict: victimAfter !== 'DO_NOT_TOUCH\n' ? 'OUT_OF_ROOT_WRITE_THROUGH_SYMLINK' : 'SYMLINK_REFUSED_OR_UNTOUCHED',
  };
}

async function v2LockHolderCannotRun() {
  // Confirm the production lock library is unusable on this Windows host, which
  // is why real old-vs-new concurrency cannot be proven here.
  const { root } = await fixture('v2-holder');
  const holderFile = path.join(SCRATCH, 'holder.mjs');
  await writeFile(holderFile, [
    "import('node:url').then(async ({pathToFileURL}) => {",
    '  const m = await import(pathToFileURL(process.argv[2]).href);',
    '  try { const l = await m.acquireLifecycleLock(process.argv[3], { mode: \'update\' });',
    "    console.log(JSON.stringify({ acquired: true, kind: 'regular-file' })); await l.release(); }",
    '  catch (e) { console.log(JSON.stringify({ acquired: false, code: e.code || null, message: e.message })); }',
    '});', '',
  ].join('\n'));
  const r = spawnSync(process.execPath, [holderFile, path.join(REPO, 'lib', 'lifecycle-lock-v2.mjs'), root], { encoding: 'utf8', cwd: REPO });
  return { status: 'EXECUTED', exitCode: r.status, output: (r.stdout || '').trim().slice(0, 400),
    stderr: (r.stderr || '').slice(-200), verdict: 'PRODUCTION_LOCK_OUTCOME' };
}

async function main() {
  SCRATCH = await mkdtemp(path.join(process.env.D01_SCRATCH_ROOT || os.tmpdir(), 'd01-pass2-'));
  const initForce = (root) => ['init', root, '--yes', '--no-github', '--force'];
  const rollback = (root) => ['rollback', root];
  const matrix = [];
  const mutations = [
    ['intact-v1', async (root, mf) => { await writeFile(mf, JSON.stringify(JSON.parse(await readFile(path.join(root, '.vcp', 'backups', ID_OLD, 'manifest.json'), 'utf8')), null, 2) + '\n'); }],
    ['missing', async (root, mf) => rm(mf, { force: true })],
    ['corrupt', async (root, mf) => writeFile(mf, '{ truncated')],
    ['higher-version-3', async (root, mf) => { const v = JSON.parse(await readFile(mf, 'utf8')); await writeFile(mf, JSON.stringify({ ...v, schemaVersion: 3 }, null, 2)); }],
    ['missing-with-v2-journal', async (root, mf) => { await putV2Journal(root); await rm(mf, { force: true }); }],
    ['missing-with-directory-sentinel', async (root, mf) => { await rm(mf, { force: true }); await mkdir(path.join(root, '.vcp', 'update.lock')); }],
    ['missing-with-v2-journal-and-sentinel', async (root, mf) => { await putV2Journal(root); await rm(mf, { force: true }); await mkdir(path.join(root, '.vcp', 'update.lock')); }],
  ];
  for (const [label, mutate] of mutations) {
    for (const [entry, args] of [['init --force', initForce], ['rollback', rollback]]) {
      const safeLabel = label + '__' + (entry === 'rollback' ? 'rollback' : 'initforce');
      try { matrix.push(await manifestCase(safeLabel, mutate, args)); }
      catch (e) { matrix.push({ case: safeLabel, status: 'ERROR', error: e.message }); }
      try { await writeFile(EVIDENCE + '.partial', JSON.stringify({ manifestMatrix: matrix, otherTests: null }, null, 2) + '\n'); } catch {}
    }
  }
  const others = {};
  const safe = async (key, fn) => {
    try { others[key] = await fn(); }
    catch (e) { others[key] = { status: 'ERROR', error: e.message }; }
    try { await writeFile(EVIDENCE + '.partial', JSON.stringify({ manifestMatrix: matrix, otherTests: others }, null, 2) + '\n'); } catch {}
  };
  await safe('agedEmptySentinelReclaim', agedEmptySentinelReclaim);
  await safe('caseVariant', caseVariant);
  await safe('junctionProbe', junctionProbe);
  await safe('symlinkManagedFile', symlinkManagedFile);
  await safe('v2LockHolder', v2LockHolderCannotRun);
  const receipt = { type: 'd01-windows-adversarial-pass2', status: 'NOT_A_MIGRATION_APPROVAL',
    platform: process.platform, arch: process.arch, node: process.version, recordedUtc: new Date().toISOString(),
    cliBin: CLI_BIN, repo: REPO, scratch: SCRATCH, manifestMatrix: matrix, otherTests: others };
  if (EVIDENCE) await writeFile(EVIDENCE, JSON.stringify(receipt, null, 2) + '\n');
  console.log('=== MANIFEST MATRIX ===');
  for (const m of matrix) {
    console.log(String(m.case).padEnd(45), 'exit=' + m.exitCode, m.verdict.padEnd(18),
      'changed=' + m.protectedChanged, 'schema=' + m.resultingSchema, 'edit=' + m.postBackupEditSurvived,
      'journal=' + m.journalSurvived, 'v2backup=' + m.v2BackupSurvived, 'lock=' + m.lockKindAfter);
  }
  console.log('=== OTHER ===');
  console.log(JSON.stringify(others, null, 1).slice(0, 3000));
  await rm(SCRATCH, { recursive: true, force: true }).catch(() => {});
}
main().catch((e) => { console.error('PASS2 FAILED: ' + e.stack); process.exitCode = 9; });
