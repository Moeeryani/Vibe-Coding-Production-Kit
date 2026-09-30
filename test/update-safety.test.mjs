import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { threeWayMerge } from '../lib/merge.mjs';
import { compareVersions, resolveMigrationPath } from '../lib/migrations.mjs';
import { hashContent } from '../lib/state.mjs';
import { planUpdate, publicUpdateReport } from '../lib/update.mjs';
import { composeMigrationMetadata } from '../lib/update-plan.mjs';

test('semantic versions compare deterministically', () => {
  assert.equal(compareVersions('0.8.0', '0.9.0'), -1);
  assert.equal(compareVersions('0.9.0', '0.9.0'), 0);
  assert.equal(compareVersions('1.0.0', '0.9.9'), 1);
});

test('migration resolver finds the supported 0.8 -> 0.9 path', () => {
  const result = resolveMigrationPath('0.8.0', '0.9.0');
  assert.deepEqual(result.map((item) => item.id), ['0.8.0-to-0.9.0-foundation']);
});

test('migration metadata composes chained renames and removals', () => {
  const metadata = composeMigrationMetadata([
    { renames: [{ from: 'docs/a.md', to: 'docs/b.md' }], removals: [] },
    { renames: [{ from: 'docs/b.md', to: 'docs/c.md' }], removals: [] }
  ]);
  assert.deepEqual([...metadata.renames.entries()], [['docs/a.md', 'docs/c.md']]);
  assert.deepEqual([...metadata.removals], []);

  const removed = composeMigrationMetadata([
    { renames: [{ from: 'docs/a.md', to: 'docs/b.md' }], removals: [] },
    { renames: [], removals: ['docs/b.md'] }
  ]);
  assert.deepEqual([...removed.renames.entries()], []);
  assert.deepEqual([...removed.removals], ['docs/a.md']);
});

test('three-way merge preserves independent local and upstream edits', () => {
  const base = 'alpha\nbeta\ngamma\n';
  const local = 'alpha local\nbeta\ngamma\n';
  const upstream = 'alpha\nbeta\ngamma upstream\n';
  const result = threeWayMerge(base, local, upstream);
  assert.equal(result.clean, true);
  assert.match(result.content, /alpha local/);
  assert.match(result.content, /gamma upstream/);
});

test('three-way merge reports overlapping edits as conflicts', () => {
  const result = threeWayMerge('one\ntwo\n', 'one local\ntwo\n', 'one upstream\ntwo\n');
  assert.equal(result.clean, false);
});

test('three-way merge handles an empty baseline without crashing', () => {
  const result = threeWayMerge('', 'local\n', 'upstream\n');
  assert.equal(result.clean, false);
  assert.match(result.reason, /Overlapping edits/);
});

test('three-way merge refuses unbounded quadratic work', () => {
  const baseLines = Array.from({ length: 2100 }, (_, index) => `line-${index}`);
  const base = `${baseLines.join('\n')}\n`;
  const localLines = [...baseLines];
  const upstreamLines = [...baseLines];
  localLines[0] = 'local-change';
  upstreamLines[upstreamLines.length - 1] = 'upstream-change';

  const result = threeWayMerge(
    base,
    `${localLines.join('\n')}\n`,
    `${upstreamLines.join('\n')}\n`
  );
  assert.equal(result.clean, false);
  assert.match(result.reason, /too large/i);
});

test('planner refuses implicit managed-file removal without migration metadata', async () => {
  const target = await mkdtemp(path.join(os.tmpdir(), 'vcp-update-safety-'));
  const relative = 'docs/legacy.md';
  const baseline = 'tracked by vcp\n';
  await mkdir(path.join(target, '.vcp/baselines/docs'), { recursive: true });
  await mkdir(path.join(target, 'docs'), { recursive: true });
  await writeFile(path.join(target, relative), baseline, 'utf8');
  await writeFile(path.join(target, '.vcp/baselines/docs/legacy.md'), baseline, 'utf8');
  await writeFile(path.join(target, '.vcp/manifest.json'), `${JSON.stringify({
    schemaVersion: 1,
    installedVersion: '0.9.0',
    installedAt: '2026-09-23T00:00:00.000Z',
    updatedAt: '2026-09-23T00:00:00.000Z',
    install: { agent: 'generic', stack: 'generic', includeGitHub: false },
    ignoredFiles: [],
    managedFiles: {
      [relative]: {
        policy: 'managed',
        origin: 'template',
        mode: 420,
        baselineHash: hashContent(baseline),
        baselinePath: '.vcp/baselines/docs/legacy.md',
        templateVersion: '0.9.0'
      }
    }
  }, null, 2)}\n`, 'utf8');

  const plan = await planUpdate({
    targetDir: target,
    targetVersion: '0.9.0',
    currentVersion: '0.9.0',
    migrations: [],
    desiredBuilder: async () => ({ files: new Map(), stack: 'generic' })
  });

  assert.equal(plan.conflicts, 1);
  assert.equal(plan.changes, 0);
  assert.equal(plan.actions[0].type, 'CONFLICT');
  assert.match(plan.actions[0].reason, /explicit migration removal/i);
});

test('public update JSON never exposes desired or file content', () => {
  const report = publicUpdateReport({
    fromVersion: '0.8.0', toVersion: '0.9.0', cliVersion: '0.9.0',
    migrationIds: [],
    stackProfileChange: {
      from: 'generic',
      to: 'javascript',
      reason: 'Stored generic profile was auto-selected and repository evidence now identifies a supported stack.'
    },
    counts: { UPDATE: 1 }, changes: 1, conflicts: 0,
    versionChange: true, needsApply: true, upToDate: false,
    actions: [{ type: 'UPDATE', path: 'AGENTS.md', reason: 'changed', content: 'SECRET', desired: { content: 'SECRET' } }]
  });
  const encoded = JSON.stringify(report);
  assert.equal(encoded.includes('SECRET'), false);
  assert.equal(report.stackProfileChange.to, 'javascript');
  assert.equal('content' in report.actions[0], false);
  assert.equal('desired' in report.actions[0], false);
});
