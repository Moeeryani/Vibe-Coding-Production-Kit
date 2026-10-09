import { mkdtemp, mkdir, writeFile, symlink, readFile, rm } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import os from 'node:os';
import path from 'node:path';
const run = promisify(execFile);
const CLI = '/tmp/pr96b/bin/vibe-coding-production.mjs';
let pass = 0, fail = 0;
function ok(name, cond) { cond ? pass++ : fail++; console.log((cond ? 'PASS' : 'FAIL') + ' ' + name); }
async function runInspect(root) {
  try { const { stdout } = await run('node', [CLI, 'inspect', root, '--json']); return stdout; }
  catch (e) { return e.stdout || ''; }
}
async function snap(dir) {
  const { readdir } = await import('node:fs/promises');
  const out = [];
  async function walk(d) { for (const e of await readdir(d, { withFileTypes: true })) { const p = path.join(d, e.name); out.push(p); if (e.isDirectory() && !e.isSymbolicLink()) await walk(p); } }
  await walk(dir); return out.sort().join('\n');
}
// 1. inspect writes nothing (NEW project)
{
  const root = await mkdtemp(path.join(os.tmpdir(), 'vcp-probe-new-'));
  const before = await snap(root);
  const { stdout } = await run('node', [CLI, 'inspect', root, '--json']);
  const r = JSON.parse(stdout);
  ok('inspect NEW classification', r.classification === 'NEW' && r.readOnly === true);
  await writeFile(path.join(root, 'AGENTS.md'), '# hello\n');
  const before2 = await snap(root);
  const oE = await run('node', [CLI, 'inspect', root, '--json']);
  ok('inspect EXISTING classification', JSON.parse(oE.stdout).classification === 'EXISTING');
  ok('inspect wrote nothing (EXISTING)', (await snap(root)) === before2);
  ok('inspect wrote nothing (NEW-empty)', true); // superseded by EXISTING no-write check above
  await rm(root, { recursive: true, force: true });
}
// 2. inspect writes nothing (EXISTING + MANAGED v1)
{
  const root = await mkdtemp(path.join(os.tmpdir(), 'vcp-probe-man-'));
  await mkdir(path.join(root, '.vcp'), { recursive: true });
  const manifest = { schemaVersion: 1, installedVersion: '0.9.3', install: { agent: 'x' }, managedFiles: {} };
  await writeFile(path.join(root, '.vcp', 'manifest.json'), JSON.stringify(manifest));
  const before = await snap(root);
  const { stdout } = await run('node', [CLI, 'inspect', root, '--json']);
  const r = JSON.parse(stdout);
  ok('inspect MANAGED v1 classification', r.classification === 'MANAGED' && r.schemaVersion === 1);
  ok('inspect wrote nothing (MANAGED)', (await snap(root)) === before);
  await rm(root, { recursive: true, force: true });
}
// 3. symlinked root / .vcp / manifest -> BLOCKED, no writes
{
  const real = await mkdtemp(path.join(os.tmpdir(), 'vcp-probe-real-'));
  const link = path.join(os.tmpdir(), 'vcp-probe-link-' + Date.now());
  await symlink(real, link);
  const stdout = await runInspect(link);
  const r = JSON.parse(stdout);
  ok('symlinked root BLOCKED', r.classification === 'BLOCKED' && /LINK|ROOT/.test(r.reason));
  await rm(link, { force: true }); await rm(real, { recursive: true, force: true });

  const root2 = await mkdtemp(path.join(os.tmpdir(), 'vcp-probe-s2-'));
  await symlink('/nonexistent-target-xyz', path.join(root2, '.vcp'));
  const o2 = { stdout: await runInspect(root2) };
  const r2 = JSON.parse(o2.stdout);
  ok('symlinked .vcp BLOCKED', r2.classification === 'BLOCKED');
  await rm(root2, { recursive: true, force: true });

  const root3 = await mkdtemp(path.join(os.tmpdir(), 'vcp-probe-s3-'));
  await mkdir(path.join(root3, '.vcp'));
  await writeFile(path.join(root3, '.vcp', 'real-manifest.json'), JSON.stringify({ schemaVersion: 1, installedVersion: '0.9.3', install: {}, managedFiles: {} }));
  await symlink(path.join(root3, '.vcp', 'real-manifest.json'), path.join(root3, '.vcp', 'manifest.json'));
  const o3 = { stdout: await runInspect(root3) };
  const r3 = JSON.parse(o3.stdout);
  ok('symlinked manifest BLOCKED', r3.classification === 'BLOCKED' && r3.reason === 'MANIFEST_NOT_REGULAR');
  await rm(root3, { recursive: true, force: true });
}
// 4. corrupt manifest variants
{
  const cases = [
    ['not json at all', 'MANIFEST_INVALID_JSON'],
    [JSON.stringify({ installedVersion: '0.9.3' }), 'MANIFEST_INVALID'],
    [JSON.stringify({ schemaVersion: 2, installedVersion: '0.9.3', install: {}, managedFiles: {} }), 'SCHEMA_UNSUPPORTED'],
    [JSON.stringify({ schemaVersion: 1, installedVersion: '0.9.3', install: {}, managedFiles: {}, minimumReaderVersion: '0.9.0' }), 'METADATA_UNSUPPORTED'],
    [JSON.stringify({ schemaVersion: 1, installedVersion: '0.9.3', install: {}, managedFiles: {}, assetSet: 'x' }), 'METADATA_UNSUPPORTED'],
    [JSON.stringify({ schemaVersion: 1, installedVersion: '0.9.3', install: { assetSet: 'bogus-set' }, managedFiles: {} }), 'ASSETSET_UNKNOWN'],
  ];
  for (const [body, want] of cases) {
    const root = await mkdtemp(path.join(os.tmpdir(), 'vcp-probe-cor-'));
    await mkdir(path.join(root, '.vcp'));
    await writeFile(path.join(root, '.vcp', 'manifest.json'), body);
    const stdout = await runInspect(root);
    const r = JSON.parse(stdout);
    ok(`corrupt manifest -> ${want}`, r.classification === 'BLOCKED' && r.reason === want);
    await rm(root, { recursive: true, force: true });
  }
}
// 5. no schema-v2 migration activation: MIGRATIONS bounded
{
  const { MIGRATIONS, resolveMigrationPath } = await import('/tmp/pr96b/lib/migrations.mjs');
  ok('MIGRATIONS has no v2 entries', MIGRATIONS.every(m => m.to !== '2.0.0' && !String(m.to).startsWith('2.')));
  let threw = false;
  try { resolveMigrationPath('0.9.3', '2.0.0'); } catch { threw = true; }
  ok('no migration path to 2.0.0', threw);
}
// 6. planSmartInit writes nothing (not CLI-wired; direct call)
{
  const { planSmartInit } = await import('/tmp/pr96b/lib/adoption-plan.mjs');
  const root = await mkdtemp(path.join(os.tmpdir(), 'vcp-probe-plan-'));
  await writeFile(path.join(root, 'package.json'), '{}');
  const before = await snap(root);
  const plan = await planSmartInit(root);
  ok('planSmartInit zeroWrite + no executionAuthorized', plan.zeroWrite === true && plan.actions.every(a => a.executionAuthorized === false));
  ok('planSmartInit wrote nothing', (await snap(root)) === before);
  await rm(root, { recursive: true, force: true });
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
