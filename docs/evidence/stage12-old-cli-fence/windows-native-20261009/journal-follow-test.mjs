// Does the old CLI follow a v2 journal to a v2 backup whose file entries exist?
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const CLI = process.env.D01_CLI_BIN;
const MARKER = 'USER_POST_BACKUP_EDIT_MUST_SURVIVE=true';
const OP = 'op-2026-0002';

const base = await mkdtemp(path.join(process.env.D01_SCRATCH_ROOT || os.tmpdir(), 'd01-journal-'));
const root = path.join(base, 'project');
await mkdir(root, { recursive: true });
const init = spawnSync(process.execPath, [CLI, 'init', root, '--yes', '--no-github'], { cwd: root, encoding: 'utf8', env: { ...process.env, CI: 'true' } });
if (init.status !== 0) throw new Error('init failed ' + init.stderr);

const mf = path.join(root, '.vcp', 'manifest.json');
const v1 = JSON.parse(await readFile(mf, 'utf8'));
const original = await readFile(path.join(root, 'AGENTS.md'));
const v2 = { ...v1, schemaVersion: 2, minimumReaderVersion: '999.0.0', install: { ...v1.install, assetSet: 'brownfield-minimal-v1' } };

// v2-shaped backup whose entries EXIST on disk, holding a pre-migration AGENTS.md
const bdir = path.join(root, '.vcp', 'backups', OP, 'files');
await mkdir(bdir, { recursive: true });
await writeFile(path.join(bdir, 'AGENTS.md'), Buffer.concat([original, Buffer.from('\nSTALE_PRE_MIGRATION_CONTENT\n')]));
await writeFile(path.join(root, '.vcp', 'backups', OP, 'backup.json'), JSON.stringify({
  formatVersion: 2, backupSchemaVersion: 2, minimumReaderVersion: '0.9.4',
  restoredManifestHash: 'a'.repeat(64), id: OP, operationId: OP, operation: 'update',
  priorVcpDirectoryExisted: true, priorManifestExisted: true, priorBaselinesExisted: true,
  priorInstalledVersion: '0.9.3', lockBootstrapCreatedVcpDirectory: false,
  entries: [{ path: 'AGENTS.md', exists: true, mode: 420 }],
}, null, 2) + '\n');
await writeFile(path.join(root, '.vcp', 'backups', OP, 'manifest.json'), JSON.stringify(v1, null, 2) + '\n');

// live v2-shaped journal that survives a commit (phase committed would be cleared;
// use 'verified' so the transaction remains and points at the backup)
await writeFile(path.join(root, '.vcp', 'transaction.json'), JSON.stringify({
  formatVersion: 2, transactionSchemaVersion: 2, minimumReaderVersion: '0.9.4',
  operation: 'update', id: OP, operationId: OP, backupId: OP, phase: 'verified',
  startedAt: new Date(Date.now() - 60000).toISOString(), plannedManifestHash: 'a'.repeat(64),
}, null, 2) + '\n');

await writeFile(mf, JSON.stringify(v2, null, 2) + '\n');
await writeFile(path.join(root, 'AGENTS.md'), Buffer.concat([original, Buffer.from('\n' + MARKER + '\n')]));

const run = (args) => spawnSync(process.execPath, [CLI, ...args], { cwd: root, encoding: 'utf8', timeout: 40000, env: { ...process.env, CI: 'true', npm_config_offline: 'true' } });
const cmd = run(['rollback', root]);
const agents = await readFile(path.join(root, 'AGENTS.md'), 'utf8').catch(() => null);
const schema = await readFile(mf, 'utf8').then((s) => JSON.parse(s).schemaVersion).catch(() => null);
let journalAfter = null, lockAfter = 'absent';
try { journalAfter = (await readFile(path.join(root, '.vcp', 'transaction.json'), 'utf8')).includes(OP); } catch {}
try { await stat(path.join(root, '.vcp', 'update.lock')); lockAfter = 'present'; } catch {}

const out = {
  scenario: "rollback following a v2 journal to an existing v2 backup", harnessExitNotCaptured: false,
  exitCode: cmd.status, stderr: (cmd.stderr || '').slice(-300),
  stdout: (cmd.stdout || '').slice(-200),
  resultingSchema: schema,
  userEditSurvived: agents ? agents.includes(MARKER) : null,
  stalePreMigrationContentWritten: agents ? agents.includes('STALE_PRE_MIGRATION_CONTENT') : null,
  journalStillPresent: journalAfter, lockAfter,
  verdict: agents && agents.includes('STALE_PRE_MIGRATION_CONTENT') && !agents.includes(MARKER)
    ? 'OLD_CLI_FOLLOWED_V2_JOURNAL_AND_ERASED_USER_EDIT'
    : 'DID_NOT_FOLLOW_IN_THIS_SHAPE',
};
console.log(JSON.stringify(out, null, 1));
await writeFile(process.env.D01_JOURNAL_RESULT || 'journal-follow-result.json', JSON.stringify(out, null, 2));
await rm(base, { recursive: true, force: true });
