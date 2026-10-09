#!/usr/bin/env node
// Independent D-01 Windows adversarial probe. Disposable fixtures only.
// Runs the authenticated published 0.9.3 tarball against lock/manifest/reparse
// states that scripts/poc-old-cli-fence.mjs never exercised.
import { createHash } from 'node:crypto';
import { spawnSync, spawn } from 'node:child_process';
import {
  closeSync, constants, existsSync, lstat, mkdir, openSync, readFileSync, readlink,
  readdir, realpath, rm, stat, utimes, writeFile,
} from 'node:fs';
import {
  lstat as lstatP, mkdir as mkdirP, readFile as readFileP, readdir as readdirP,
  rm as rmP, utimes as utimesP, writeFile as writeFileP, mkdtemp,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const CLI_BIN = process.env.D01_CLI_BIN;
const INTEGRATION = '/d/NotReal';
const EVIDENCE = process.env.D01_EVIDENCE_DIR;
const MARKER = 'USER_POST_BACKUP_EDIT_MUST_SURVIVE=true';
const results = [];

function sha(bytes) { return createHash('sha256').update(bytes).digest('hex'); }
function run(bin, args, cwd, timeout = 40000) {
  const r = spawnSync(process.execPath, [bin, ...args], {
    cwd, encoding: 'utf8', timeout, maxBuffer: 1 << 20,
    env: { ...process.env, CI: 'true', npm_config_offline: 'true' },
  });
  return {
    args, exitCode: r.status, signal: r.signal, error: r.error?.message ?? null,
    stdout: (r.stdout ?? '').slice(-1500), stderr: (r.stderr ?? '').slice(-1500),
  };
}
async function lockKind(root) {
  try {
    const s = await lstatP(path.join(root, '.vcp', 'update.lock'));
    if (s.isSymbolicLink()) return 'symlink';
    return s.isDirectory() ? 'directory' : s.isFile() ? 'regular-file' : 'other';
  } catch (e) { if (e.code === 'ENOENT') return 'absent'; throw e; }
}
async function snapshot(root) {
  const out = new Map();
  async function walk(dir, parent = '') {
    let entries = [];
    try {
      entries = (await readdirP(dir, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name));
    } catch (error) {
      if (error?.code === 'ENOENT') { out.set(parent + '/', 'vanished:' + error.code); return; }
      throw error;
    }
    for (const item of entries) {
      const rel = parent ? `${parent}/${item.name}` : item.name;
      if (rel === '.vcp/update.lock') continue; // kind tracked separately
      const target = path.join(dir, item.name);
      let s;
      try { s = await lstatP(target); }
      catch (error) { // concurrent delete/replace during the walk is itself evidence
        out.set(rel, 'raced:' + error.code); continue;
      }
      try {
        if (s.isSymbolicLink()) out.set(rel, 'link:' + await readlink(target));
        else if (s.isDirectory()) { out.set(rel + '/', 'dir'); await walk(target, rel); }
        else if (s.isFile()) out.set(rel, 'file:' + sha(await readFileP(target)));
        else out.set(rel, 'special:' + s.mode);
      } catch (error) { out.set(rel, 'raced:' + error.code); }
    }
  }
  await walk(root);
  return out;
}
function diff(before, after) {
  const keys = [...new Set([...before.keys(), ...after.keys()])].sort();
  return keys.filter((k) => before.get(k) !== after.get(k))
    .map((k) => ({ path: k, before: before.get(k) ?? null, after: after.get(k) ?? null }));
}
async function schemaOf(root) {
  try { return JSON.parse(await readFileP(path.join(root, '.vcp', 'manifest.json'), 'utf8')).schemaVersion; }
  catch { return null; }
}
async function editSurvived(root) {
  try { return (await readFileP(path.join(root, 'AGENTS.md'), 'utf8')).includes(MARKER); }
  catch { return null; }
}

const IDS = { old: '2026-01-01T00-00-00-000Z-a0000000' };
async function baseFixture(name) {
  const root = path.join(SCRATCH, 'projects', name);
  await mkdirP(root, { recursive: true });
  const init = run(CLI_BIN, ['init', root, '--yes', '--no-github'], root, 60000);
  if (init.exitCode !== 0) throw new Error(`baseline init failed: ${init.stderr}`);
  const mfPath = path.join(root, '.vcp', 'manifest.json');
  const v1 = JSON.parse(await readFileP(mfPath, 'utf8'));
  const original = await readFileP(path.join(root, 'AGENTS.md'));
  // v2-shaped manifest with an unreachable reader version (same shape as the POC)
  const v2 = { ...v1, schemaVersion: 2, minimumReaderVersion: '999.0.0', install: { ...v1.install, assetSet: 'brownfield-minimal-v1' } };
  const backupDir = path.join(root, '.vcp', 'backups', IDS.old, 'files');
  await mkdirP(backupDir, { recursive: true });
  await writeFileP(path.join(backupDir, 'AGENTS.md'), original);
  await writeFileP(path.join(root, '.vcp', 'backups', IDS.old, 'manifest.json'), JSON.stringify(v1, null, 2) + '\n');
  await writeFileP(path.join(root, '.vcp', 'backups', IDS.old, 'backup.json'), JSON.stringify({
    id: IDS.old, createdAt: '2026-01-01T00:00:00Z', installedVersion: '0.9.3',
    entries: [{ path: 'AGENTS.md', exists: true, mode: 420 }],
  }, null, 2) + '\n');
  await writeFileP(mfPath, JSON.stringify(v2, null, 2) + '\n');
  await writeFileP(path.join(root, 'AGENTS.md'),
    Buffer.concat([original, Buffer.from(`\n${MARKER}\n`)]));
  return root;
}

let SCRATCH;
let pick = () => true;
const record = (r) => { results.push(r); console.log(JSON.stringify(r)); };

async function test(id, title, fn) {
  if (!pick(id)) return;
  const started = Date.now();
  try {
    const detail = await fn();
    record({ id, title, status: detail.status, verdict: detail.verdict ?? null,
      detail, durationMs: Date.now() - started });
  } catch (error) {
    record({ id, title, status: 'ERROR', error: error.message, stack: error.stack?.split('\n').slice(0, 4),
      durationMs: Date.now() - started });
  }
}

// ---------------------------------------------------------------- A. locks
async function agedDirectorySentinel({ aged, withToken }) {
  const name = `aged-dir-sentinel${aged ? '' : '-fresh'}${withToken ? '-withtoken' : ''}`;
  const root = await baseFixture(name);
  const lock = path.join(root, '.vcp', 'update.lock');
  await mkdirP(lock);
  let tokenBytes = null;
  if (withToken) {
    tokenBytes = JSON.stringify({ version: 2, mode: 'update', pid: process.pid, host: os.hostname(), token: 'a'.repeat(48) });
    await writeFileP(path.join(lock, 'owner.json'), tokenBytes);
  }
  if (aged) {
    const t = new Date(Date.now() - 2 * 60 * 60 * 1000);
    await utimesP(lock, t, t);
  }
  const before = await snapshot(root);
  const cmd = run(CLI_BIN, ['rollback', root], root);
  const after = await snapshot(root);
  const changes = diff(before, after);
  let sentinelContents = null;
  try { sentinelContents = await readdirP(lock); } catch (e) { sentinelContents = `un_readable:${e.code}`; }
  const kind = await lockKind(root);
  return {
    status: 'EXECUTED', aged, withToken,
    lockKindBefore: aged || withToken ? 'directory' : 'directory', lockKindAfter: kind,
    sentinelContentsAfter: sentinelContents,
    tokenFileDestroyed: withToken ? !(await existsSync(path.join(lock, 'owner.json'))) : null,
    exitCode: cmd.exitCode, stderr: cmd.stderr.slice(-400),
    changes, resultingSchema: await schemaOf(root), postBackupEditSurvived: await editSurvived(root),
    verdict: changes.length ? 'LEGACY_MUTATION_AFTER_SENTINEL' : 'SENTINEL_HELD',
  };
}

async function livePidSameHost() {
  const root = await baseFixture('live-pid-same-host');
  const lock = path.join(root, '.vcp', 'update.lock');
  const child = spawn(process.execPath, ['-e', 'setTimeout(()=>{},120000)'], { stdio: 'ignore' });
  await new Promise((r) => setTimeout(r, 300));
  await writeFileP(lock, JSON.stringify({ pid: child.pid, host: os.hostname(), startedAt: new Date().toISOString() }));
  const before = await snapshot(root);
  const cmd = run(CLI_BIN, ['rollback', root], root);
  const after = await snapshot(root);
  const changes = diff(before, after);
  child.kill();
  return {
    status: 'EXECUTED', holderPid: child.pid, holderAlive: !child.killed,
    exitCode: cmd.exitCode, stderr: cmd.stderr.slice(-400), changes,
    lockKindAfter: await lockKind(root), resultingSchema: await schemaOf(root),
    postBackupEditSurvived: await editSurvived(root),
    verdict: changes.length ? 'LEGACY_MUTATION_OVER_LIVE_SAME_HOST_PID' : 'REFUSED',
  };
}

async function foreignHostLivePid({ aged }) {
  const root = await baseFixture(`foreign-pid${aged ? '-aged' : '-fresh'}`);
  const lock = path.join(root, '.vcp', 'update.lock');
  const child = spawn(process.execPath, ['-e', 'setTimeout(()=>{},120000)'], { stdio: 'ignore' });
  await new Promise((r) => setTimeout(r, 300));
  const pid = child.pid;
  child.kill();
  await writeFileP(lock, JSON.stringify({ pid, host: 'OTHER_HOST_9f2c', startedAt: new Date().toISOString() }));
  if (aged) { const t = new Date(Date.now() - 2 * 3600 * 1000); await utimesP(lock, t, t); }
  const before = await snapshot(root);
  const cmd = run(CLI_BIN, ['rollback', root], root);
  const after = await snapshot(root);
  const changes = diff(before, after);
  return {
    status: 'EXECUTED', foreignPidThatIsLocallyLive: pid, aged,
    exitCode: cmd.exitCode, stderr: cmd.stderr.slice(-400), changes,
    resultingSchema: await schemaOf(root), postBackupEditSurvived: await editSurvived(root),
    verdict: changes.length ? 'LEGACY_MUTATION_ON_UNVERIFIABLE_FOREIGN_OWNER' : 'REFUSED',
    note: 'pid is live on THIS host but claimed on another host, so liveness proves nothing cross-host',
  };
}

async function malformedVariants() {
  const variants = {};
  for (const [label, payload] of [
    ['empty', ''], ['not-json', 'not json at all\n'],
    ['json-no-pid', JSON.stringify({ host: os.hostname() })],
    ['json-pid-null', JSON.stringify({ pid: null, host: os.hostname(), startedAt: 'x' })],
    ['json-array', '[1,2,3]\n'],
  ]) {
    const root = await baseFixture(`malformed-${label}`);
    const lock = path.join(root, '.vcp', 'update.lock');
    await writeFileP(lock, payload);
    const before = await snapshot(root);
    const cmd = run(CLI_BIN, ['rollback', root], root);
    const after = await snapshot(root);
    variants[label] = {
      exitCode: cmd.exitCode, changes: diff(before, after).length,
      lockKindAfter: await lockKind(root), postBackupEditSurvived: await editSurvived(root),
    };
  }
  const mutating = Object.entries(variants).filter(([, v]) => v.changes > 0).map(([k]) => k);
  return { status: 'EXECUTED', variants, mutatingWithin1Hour: mutating,
    verdict: mutating.length ? 'LEGACY_MUTATION_ON_MALFORMED_VARIANTS' : 'ALL_MALFORMED_REFUSED' };
}

// Spawn and attach collectors synchronously; a 'close' listener registered
// after the child exits never fires, which silently hangs the await.
function reap(cmd, args, opts = {}) {
  const child = spawn(cmd, args, { ...opts, stdio: opts.stdio ?? 'pipe' });
  let stdout = '', stderr = '';
  if (child.stdout) child.stdout.on('data', (d) => { stdout += d; });
  if (child.stderr) child.stderr.on('data', (d) => { stderr += d; });
  const done = new Promise((resolve) => {
    let settled = false;
    const finish = (code, signal) => { if (!settled) { settled = true; resolve({ code, signal, stdout, stderr }); } };
    child.on('close', finish);
    child.on('exit', (code, signal) => setTimeout(() => finish(code, signal), 50).unref());
    child.on('error', (e) => { stderr += ' SPAWN_ERROR ' + e.code; finish(null, 'spawn-error:' + e.code); });
  });
  return { child, done, get streams() { return { stdout, stderr }; } };
}

async function contentionOldVsOld() {
  const root = await baseFixture('contention-old-vs-old');
  const before = await snapshot(root);
  const a = reap(process.execPath, [CLI_BIN, 'rollback', root], { cwd: root, env: { ...process.env, CI: 'true' } });
  const b = reap(process.execPath, [CLI_BIN, 'rollback', root], { cwd: root, env: { ...process.env, CI: 'true' } });
  const [ra, rb] = await Promise.all([a.done, b.done]);
  const after = await snapshot(root);
  return { status: 'EXECUTED',
    A: { code: ra.code, signal: ra.signal, stderr: ra.stderr.slice(-300) },
    B: { code: rb.code, signal: rb.signal, stderr: rb.stderr.slice(-300) },
    changes: diff(before, after).length,
    resultingSchema: await schemaOf(root), postBackupEditSurvived: await editSurvived(root),
    verdict: (ra.code === 0 && rb.code === 0) ? 'BOTH_OLD_PROCESSES_SUCCEEDED' : 'SERIALIZED_OR_REFUSED' };
}

// ------------------------------------------------- B. unowned lock release
async function restoreBackupStealsHeldLock() {
  const root = await baseFixture('restorebackup-foreign-lock');
  const lock = path.join(root, '.vcp', 'update.lock');
  const held = JSON.stringify({ version: 2, mode: 'update', pid: 4242, host: os.hostname(), token: 'b'.repeat(48) });
  await writeFileP(lock, held);
  const before = await snapshot(root);
  // Direct call into the authenticated published package: the exact primitive
  // rollbackProject() uses after it has finished restoring.
  const mod = await import(pathToFileURLSafe(path.join(TARBALL_PKG, 'lib', 'state.mjs')));
  let thrown = null;
  try { await mod.restoreBackup(root, IDS.old); } catch (e) { thrown = `${e.code ?? e.constructor.name}: ${e.message}`; }
  const after = await snapshot(root);
  const changes = diff(before, after);
  const lockNow = await readFileP(lock, 'utf8').catch(() => null);
  return {
    status: 'EXECUTED', entrypoint: 'published lib/state.mjs restoreBackup()',
    thrown, lockStillHeldByOther: lockNow, foreignLockDeleted: lockNow === null,
    changes, resultingSchema: await schemaOf(root), postBackupEditSurvived: await editSurvived(root),
    verdict: lockNow === null ? 'FOREIGN_LOCK_STOLEN_BY_OLD_RESTORE' : 'LOCK_PRESERVED',
  };
}
const pathToFileURLSafe = (p) => 'file:///' + p.replaceAll('\\', '/').replace(/^\/+/, '');

// ---------------------------------------------- C. new-writer lock handoff
async function v2SimulatedHandoff() {
  const root = await baseFixture('v2-simulated-double-window');
  const holderScript = [
    "import('node:url').then(async ({pathToFileURL}) => {",
    '  const m = await import(pathToFileURL(process.argv[2]).href);',
    '  const root = process.argv[3];',
    "  const say = (o) => process.send ? process.send(o) : console.log(JSON.stringify(o));",
    '  try {',
    "    const first = await m.acquireLifecycleLock(root, { mode: 'update' });",
    "    say({ stage: 'acquired', pid: process.pid, kind: 'regular-file' });",
    '    await new Promise(r => setTimeout(r, 1500));',
    '    await first.release();',
    "    say({ stage: 'released' });",
    "    const second = await m.acquireLifecycleLock(root, { mode: 'update' });",
    "    say({ stage: 'reacquired', tokenPrefix: second.token.slice(0, 8) });",
    '    await new Promise(r => setTimeout(r, 4000));',
    '    await second.release();',
    "    say({ stage: 'done' });",
    "  } catch (e) { say({ stage: \"error\", code: e.code || null, message: e.message }); process.exitCode = 7; }",
    '});',
    '',
  ].join('\n');
  const holderFile = path.join(SCRATCH, 'v2-holder.mjs');
  await writeFileP(holderFile, holderScript);
  const holder = spawn(process.execPath, [holderFile, path.join(REPO, 'lib', 'lifecycle-lock-v2.mjs'), root], { cwd: REPO, encoding: 'utf8' });
  const events = [];
  let stderr = '';
  holder.stdout.on('data', (d) => String(d).split('\n').filter(Boolean).forEach((l) => { try { events.push(JSON.parse(l)); } catch { events.push({ raw: l }); } }));
  holder.stderr.on('data', (d) => { stderr += d; });
  const waitFor = async (stage, ms) => {
    const deadline = Date.now() + ms;
    while (Date.now() < deadline) {
      if (events.some((e) => e.stage === stage)) return true;
      if (events.some((e) => e.stage === 'error')) return false;
      await new Promise((r) => setTimeout(r, 20));
    }
    return false;
  };
  const acquired = await waitFor('acquired', 8000);
  if (!acquired) return { status: 'BLOCKED', reason: 'v2 lock holder never acquired', holderEvents: events, holderStderr: stderr.slice(-400) };
  const before = await snapshot(root);
  const cmd = run(CLI_BIN, ['rollback', root], root);
  const midRefused = cmd.exitCode !== 0;
  // Wait for the release/reacquire window, then retry the old CLI.
  const reacquired = await waitFor('reacquired', 12000);
  const cmd2 = run(CLI_BIN, ['rollback', root], root);
  const after = await snapshot(root);
  const changes = diff(before, after);
  holder.kill();
  return {
    status: 'EXECUTED', holderEvents: events, holderStderr: stderr.slice(-400), reacquiredObserved: reacquired,
    firstAttempt: { exitCode: cmd.exitCode, refused: midRefused, stderr: cmd.stderr.slice(-300) },
    secondAttempt: { exitCode: cmd2.exitCode, stderr: cmd2.stderr.slice(-300) },
    changes, resultingSchema: await schemaOf(root), postBackupEditSurvived: await editSurvived(root),
    verdict: changes.length ? 'OLD_CLI_MUTATED_WHILE_NEW_WRITER_LIVED' : 'NO_MUTATION_IN_WINDOW',
    caveat: 'simulated writer lifecycle using the real lock library; not the gated production migrator',
  };
}

// -------------------------------------------------------- D. crash recovery
async function killMidRun() {
  const root = await baseFixture('kill-mid-rollback');
  const before = await snapshot(root);
  const proc = reap(process.execPath, [CLI_BIN, 'rollback', root], { cwd: root, env: { ...process.env, CI: 'true' } });
  await new Promise((r) => setTimeout(r, 180));
  proc.child.kill('SIGKILL');
  const code = await proc.done;
  const after = await snapshot(root);
  const state = {
    lockKind: await lockKind(root),
    lockContent: await readFileP(path.join(root, '.vcp', 'update.lock'), 'utf8').catch(() => null),
    transaction: await readFileP(path.join(root, '.vcp', 'transaction.json'), 'utf8').catch(() => null),
    stageDirExists: existsSync(path.join(root, '.vcp', 'stage')),
    resultingSchema: await schemaOf(root), postBackupEditSurvived: await editSurvived(root),
  };
  // Recovery attempt with the old CLI
  const retry = run(CLI_BIN, ['rollback', root], root);
  const afterRetry = await snapshot(root);
  return {
    status: 'EXECUTED', killResult: code, interrupted: { ...state },
    retryExitCode: retry.exitCode, retryChanges: diff(after, afterRetry).length,
    afterRetry: { lockKind: await lockKind(root), resultingSchema: await schemaOf(root), postBackupEditSurvived: await editSurvived(root) },
    changesByKill: diff(before, after).length,
    verdict: 'OBSERVED',
  };
}

async function nameTooLongFailure() {
  const root = await baseFixture('nametoolong-write');
  // Deep path forces ENAMETOOLONG during the old CLI's backup/stage writes.
  const deep = path.join(root, 'a'.repeat(200));
  let guard = null;
  try { await mkdirP(deep, { recursive: true }); } catch (e) { guard = e.code; }
  const before = await snapshot(root);
  const cmd = run(CLI_BIN, ['init', root, '--yes', '--no-github', '--force'], root);
  const after = await snapshot(root);
  return {
    status: existsSync(deep) ? 'EXECUTED' : 'BLOCKED',
    note: 'mkdir succeeded, depth not a failure trigger on this path', guard,
    exitCode: cmd.exitCode, changes: diff(before, after).length,
    stderr: cmd.stderr.slice(-300),
    verdict: 'OBSERVED',
  };
}

// ------------------------------------------- D3. lock swap during a live run
async function lockReplacedMidRun() {
  const root = await baseFixture('lock-swap-mid-update');
  const lock = path.join(root, '.vcp', 'update.lock');
  const before = await snapshot(root);
  const proc = reap(process.execPath, [CLI_BIN, 'update', root, '--offline'], {
    cwd: root, env: { ...process.env, CI: 'true', npm_config_offline: 'true' },
  });
  // Poll for the old CLI's own lock (pid == child), then replace it with a
  // different writer's lock while the old CLI is still running.
  let swapped = false, sawOwnLock = false, swapError = null;
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline && !swapped) {
    const raw = await readFileP(lock, 'utf8').catch(() => null);
    if (raw) {
      try {
        if (JSON.parse(raw).pid === proc.child.pid) {
          sawOwnLock = true;
          try {
            await rmP(lock, { force: true });
            await writeFileP(lock, JSON.stringify({ version: 2, mode: 'update', pid: 9999, host: os.hostname(), token: 'c'.repeat(48) }));
            swapped = true;
          } catch (e) { swapError = e.code; }
        }
      } catch { /* partial write */ }
    }
    if (proc.child.exitCode !== null) break;
    await new Promise((r) => setTimeout(r, 2));
  }
  const res = await proc.done;
  const after = await snapshot(root);
  const finalLock = await readFileP(lock, 'utf8').catch(() => null);
  return {
    status: 'EXECUTED', sawOldCliOwnLock: sawOwnLock, swapLanded: swapped, swapError,
    exitCode: res.code, signal: res.signal, stderr: res.stderr.slice(-300),
    foreignLockSurvivedOldRun: finalLock !== null,
    foreignLockDeleted: swapped && finalLock === null,
    changes: diff(before, after).length, postBackupEditSurvived: await editSurvived(root),
    verdict: swapped && finalLock === null ? 'OLD_CLI_STOLE_REPLACEMENT_LOCK'
      : swapped ? 'REPLACEMENT_LOCK_SURVIVED' : 'RACE_WINDOW_NOT_OBSERVED',
  };
}

// ------------------------------------------------------ E. reparse points
async function junctionEscape() {
  const root = await baseFixture('junction-escape');
  const outside = path.join(SCRATCH, 'outside-target');
  await mkdirP(outside, { recursive: true });
  const victim = path.join(outside, 'IMPORTANT_UNRELATED_FILE.txt');
  await writeFileP(victim, 'DO_NOT_TOUCH\n');
  const backups = path.join(root, '.vcp', 'backups', IDS.old, 'files');
  await writeFileP(path.join(outside, 'AGENTS.md'), 'INJECTED_FROM_OUTSIDE\n');
  await rmP(backups, { recursive: true, force: true });
  const mk = spawnSync('cmd.exe', ['/c', 'mklink', '/J', backups.replaceAll('/', '\\'), outside.replaceAll('/', '\\')], { encoding: 'utf8' });
  if (!existsSync(backups)) return { status: 'BLOCKED', reason: 'junction not created', mk: mk.stderr };
  const target = path.join(root, 'AGENTS.md');
  const link = path.join(root, 'link_to_outside.md');
  const mk2 = spawnSync('cmd.exe', ['/c', 'mklink', path.win32 ? link.replaceAll('/', '\\') : link, victim.replaceAll('/', '\\')], { encoding: 'utf8' });
  const symlinkCreated = existsSync(link);
  const before = await snapshot(root);
  const cmd = run(CLI_BIN, ['rollback', root], root);
  const after = await snapshot(root);
  const victimAfter = await readFileP(victim, 'utf8').catch(() => null);
  return {
    status: 'EXECUTED', junctionOnBackups: true, managedSymlinkCreated: symlinkCreated,
    mklinkError: mk2.stderr.slice(-200) || null,
    exitCode: cmd.exitCode, changes: diff(before, after).slice(0, 12),
    outsideFileBefore: 'DO_NOT_TOUCH\n', outsideFileAfter: victimAfter,
    verdict: victimAfter !== 'DO_NOT_TOUCH\n' ? 'OUT_OF_ROOT_WRITE_OBSERVED' : 'OUTSIDE_UNTOUCHED',
  };
}

async function symlinkedManifest() {
  const root = await baseFixture('symlink-manifest');
  const outside = path.join(SCRATCH, 'symlink-out');
  await mkdirP(outside, { recursive: true });
  const outsideManifest = path.join(outside, 'outside-manifest.json');
  await writeFileP(outsideManifest, JSON.stringify({ schemaVersion: 1, installedVersion: '0.9.3', managedFiles: [] }));
  const mf = path.join(root, '.vcp', 'manifest.json');
  await rmP(mf, { force: true });
  const mk = spawnSync('cmd.exe', ['/c', 'mklink', mf.replaceAll('/', '\\'), outsideManifest.replaceAll('/', '\\')], { encoding: 'utf8' });
  const created = await lstatP(mf).then((s) => s.isSymbolicLink()).catch(() => false);
  const before = await snapshot(root);
  const cmd = run(CLI_BIN, ['init', root, '--yes', '--no-github', '--force'], root);
  const after = await snapshot(root);
  const outsideAfter = await readFileP(outsideManifest, 'utf8').catch(() => null);
  return {
    status: created ? 'EXECUTED' : 'BLOCKED',
    reason: created ? null : `developer mode/admin required for symlinks: ${(mk.stderr || '').slice(-200)}`,
    exitCode: cmd.exitCode, changes: diff(before, after).length,
    outsideManifestRewritten: outsideAfter,
    verdict: created ? (outsideAfter && !outsideAfter.includes('"schemaVersion": 1') ? 'SYMLINK_FOLLOWED' : 'SYMLINK_NOT_FOLLOWED') : 'BLOCKED',
  };
}

async function caseVariantPath() {
  const root = await baseFixture('case-variant');
  const asIs = root;
  const lowered = root.charAt(0).toUpperCase() + root.slice(1).toLowerCase();
  const before = await snapshot(asIs);
  const cmd = run(CLI_BIN, ['rollback', lowered], asIs);
  const after = await snapshot(asIs);
  return {
    status: 'EXECUTED', requestedPath: lowered, realPath: await realpath(asIs),
    exitCode: cmd.exitCode, stderr: cmd.stderr.slice(-300),
    changes: diff(before, after).length, postBackupEditSurvived: await editSurvived(asIs),
    verdict: 'OBSERVED',
  };
}

async function parentSwapDuringRun() {
  // Replace .vcp between the old CLI's first stat and its writes is not
  // observable without injection; approximate at the CLI boundary instead:
  // after init has resolved the root, rename .vcp and see whether the running
  // command recreates it.
  const root = await baseFixture('parent-swap');
  const proc = reap(process.execPath, [CLI_BIN, 'rollback', root], { cwd: root, env: { ...process.env, CI: 'true' } });
  await new Promise((r) => setTimeout(r, 120));
  let swapped = false;
  try { await rmP(path.join(root, '.vcp', 'backups', IDS.old), { recursive: true, force: true }); swapped = true; } catch {}
  const res = await proc.done;
  const after = await snapshot(root);
  return {
    status: 'EXECUTED', backupDeletedMidRun: swapped, exitCode: res.code, signal: res.signal,
    stderr: res.stderr.slice(-300),
    resultingSchema: await schemaOf(root), postBackupEditSurvived: await editSurvived(root),
    fileCount: after.size, verdict: 'OBSERVED',
  };
}

async function main() {
  process.on('beforeExit', (c) => console.error('[beforeExit] code=' + c + ' completed=' + results.length));
  process.on('uncaughtException', (e) => console.error('[uncaughtException] ' + (e && e.stack || e)));
  process.on('unhandledRejection', (e) => console.error('[unhandledRejection] ' + (e && e.stack || e)));
  const only = process.env.D01_ONLY ? process.env.D01_ONLY.split(',') : null;
  pick = (id) => !only || only.includes(id);
  console.error('[dbg] only=' + JSON.stringify(only) + ' pickA7=' + pick('A7') + ' cliBin=' + JSON.stringify(CLI_BIN));
  SCRATCH = await mkdtemp(path.join(process.env.D01_SCRATCH_ROOT || os.tmpdir(), 'd01-adversarial-'));
  const receipt = { type: 'd01-windows-adversarial', status: 'NOT_A_MIGRATION_APPROVAL',
    platform: process.platform, arch: process.arch, node: process.version,
    cliBin: CLI_BIN, repo: REPO, scratch: SCRATCH, recordedUtc: new Date().toISOString(), results: [] };
  const registry = [
    ['A1', 'aged directory sentinel (mtime > 1h) vs old rollback', () => agedDirectorySentinel({ aged: true, withToken: false })],
    ['A2', 'fresh directory sentinel holding a token file', () => agedDirectorySentinel({ aged: false, withToken: true })],
    ['A3', 'live same-host PID lock vs old rollback', livePidSameHost],
    ['A4', 'foreign-host PID (locally live) fresh lock', () => foreignHostLivePid({ aged: false })],
    ['A5', 'foreign-host PID (locally live) aged lock', () => foreignHostLivePid({ aged: true })],
    ['A6', 'malformed lock payload variants', malformedVariants],
    ['A7', 'two old CLI processes racing the same lock', contentionOldVsOld],
    ['B1', 'published restoreBackup() over a lock held by another writer', restoreBackupStealsHeldLock],
    ['C1', 'old CLI vs simulated v2 lock holder release/reacquire window', v2SimulatedHandoff],
    ['D1', 'SIGKILL mid-rollback and old CLI retry', killMidRun],
    ['D2', 'write failure simulation (deep path / ENAMETOOLONG)', nameTooLongFailure],
    ['D3', 'lock removed mid-run then released by old CLI', lockReplacedMidRun],
    ['E1', 'junction on restore source dir + managed symlink to outside file', junctionEscape],
    ['E2', 'symlinked manifest + old init --force', symlinkedManifest],
    ['E3', 'case-variant project path', caseVariantPath],
    ['E4', 'backup removed while rollback runs', parentSwapDuringRun],
  ];
  try {
    for (const [id, title, fn] of registry) {
      if (!pick(id)) continue;
      console.error('[dbg] running ' + id);
      await test(id, title, fn);
    }
  } catch (fatal) {
    console.error('[fatal-in-loop] ' + (fatal && fatal.stack || fatal));
    record({ id: 'FATAL', title: 'harness fatal', status: 'ERROR', error: String(fatal && fatal.message || fatal) });
  } finally {
    receipt.results = results;
    if (EVIDENCE) {
      await mkdirP(path.dirname(EVIDENCE), { recursive: true });
      await writeFileP(EVIDENCE, JSON.stringify(receipt, null, 2) + '\n');
    }
    console.log('\n=== SUMMARY ===');
    for (const r of results) console.log(r.id.padEnd(3), (r.status + '').padEnd(9), (r.verdict ?? '').padEnd(46), r.title);
    await rmP(SCRATCH, { recursive: true, force: true }).catch(() => {});
  }
}

const REPO = process.env.D01_REPO;
const TARBALL_PKG = process.env.D01_PKG_DIR;
main().catch((e) => { console.error('HARNESS FAILED: ' + e.stack); process.exitCode = 9; });
