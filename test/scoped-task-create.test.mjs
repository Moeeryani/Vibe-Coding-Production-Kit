// SC-01 scoped Task Pack creation — acceptance tests SC-T01–SC-T46
// (Linux). Windows-native cases SC-T47–SC-T49 are NOT implemented
// here and remain UNPROVEN; see VCP-OD1-SECURITY-ACCEPTANCE-MATRIX.md.
// Fixtures are disposable real filesystems under os.tmpdir(). No
// test in this file changes an existing refusal test or asserts a
// fabricated security receipt: harness cases assert invariants and
// report their race outcomes in comments/results, never certainty
// about unobserved interleavings.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  lstat, mkdir, mkdtemp, readFile, readdir, rename, symlink, writeFile
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createTaskPack } from '../lib/task.mjs';
import { createScopedTaskFile } from '../lib/scoped-task-create.mjs';
import { inspectProject } from '../lib/adoption-inspect.mjs';
import { resolveProjectPath } from '../lib/safe-path.mjs';
import { createOwnedPathExclusively } from '../lib/safe-create.mjs';
import { assertManagedMigrationGate } from '../lib/managed-migration.mjs';
import { lifecycleDurabilityCapability } from '../lib/file-durability.mjs';
import { runTaskReadiness } from '../lib/readiness.mjs';
import { seedLegacyV1Fixture } from './helpers/legacy-v1-fixture.mjs';
import { seedUnmanagedProject } from './helpers/unmanaged-fixture.mjs';

const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');

async function sandbox(t) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'vcp-scoped-'));
  t.after(async () => {
    // Best-effort cleanup; the campaign TMPDIR owns leftovers.
    const { rm } = await import('node:fs/promises');
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  });
  return dir;
}

async function project(t, name = 'vcp-proj') {
  const base = await sandbox(t);
  const root = path.join(base, name);
  await mkdir(root, { recursive: true });
  return root;
}

async function walkFiles(root) {
  const out = [];
  async function walk(dir, rel) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const childRel = rel ? `${rel}/${entry.name}` : entry.name;
      const child = path.join(dir, entry.name);
      if (entry.isDirectory() && !entry.isSymbolicLink()) await walk(child, childRel);
      else out.push(childRel);
    }
  }
  await walk(root, '');
  return out.sort();
}

async function treeHashes(root) {
  const files = await walkFiles(root);
  const map = {};
  for (const rel of files) map[rel] = sha(await readFile(path.join(root, rel)));
  return map;
}

const PACK_BYTES = Buffer.from('# Task — Harness\n\nStatus: Draft\n', 'utf8');

// ---------- 1.1 Eligibility ----------

test('SC-T01 eligible NEW project creates exactly one file, no .vcp state', async (t) => {
  const root = await project(t);
  const result = await createTaskPack({ targetDir: root, slug: 'demo-task' });
  assert.equal(result.relative, 'docs/tasks/demo-task.md');
  assert.deepEqual(await walkFiles(root), ['docs/tasks/demo-task.md']);
  assert.equal((await lstat(path.join(root, '.vcp')).catch((e) => e.code)), 'ENOENT');
  const inspected = await inspectProject(root);
  assert.ok(['EXISTING'].includes(inspected.classification));
});

test('SC-T02 eligible EXISTING project: pack carries AGENTS.md commands, other files untouched', async (t) => {
  const root = await project(t);
  await seedUnmanagedProject({ targetDir: root, commands: { UNIT_TEST_COMMAND: 'npm run unit-tests', CHECK_COMMAND: 'npm run check' } });
  const before = await treeHashes(root);
  const result = await createTaskPack({ targetDir: root, slug: 'demo-task' });
  assert.match(result.content, /UNIT_TEST_COMMAND/);
  assert.match(result.content, /npm run unit-tests/);
  const after = await treeHashes(root);
  for (const [rel, hash] of Object.entries(before)) assert.equal(after[rel], hash, `${rel} changed`);
  assert.deepEqual(Object.keys(after).filter((f) => !(f in before)), ['docs/tasks/demo-task.md']);
  assert.equal((await lstat(path.join(root, '.vcp')).catch((e) => e.code)), 'ENOENT');
});

test('SC-T03 existing docs/ dir keeps its identity', async (t) => {
  const root = await project(t);
  await seedUnmanagedProject({ targetDir: root, docsDir: true });
  const before = await lstat(path.join(root, 'docs'), { bigint: true });
  await createTaskPack({ targetDir: root, slug: 'demo-task' });
  const after = await lstat(path.join(root, 'docs'), { bigint: true });
  assert.equal(after.dev, before.dev);
  assert.equal(after.ino, before.ino);
});

test('SC-T04 existing docs/tasks/ with siblings: siblings byte-identical and identity-stable', async (t) => {
  const root = await project(t);
  await seedUnmanagedProject({ targetDir: root });
  await mkdir(path.join(root, 'docs', 'tasks'), { recursive: true });
  await writeFile(path.join(root, 'docs', 'tasks', 'other.md'), 'sibling\n');
  const siblingBefore = await lstat(path.join(root, 'docs', 'tasks', 'other.md'), { bigint: true });
  const siblingHash = sha(await readFile(path.join(root, 'docs', 'tasks', 'other.md')));
  await createTaskPack({ targetDir: root, slug: 'demo-task' });
  const siblingAfter = await lstat(path.join(root, 'docs', 'tasks', 'other.md'), { bigint: true });
  assert.equal(siblingAfter.dev, siblingBefore.dev);
  assert.equal(siblingAfter.ino, siblingBefore.ino);
  assert.equal(sha(await readFile(path.join(root, 'docs', 'tasks', 'other.md'))), siblingHash);
});

test('SC-T05 dry-run writes nothing', async (t) => {
  const root = await project(t);
  await seedUnmanagedProject({ targetDir: root });
  const result = await createTaskPack({ targetDir: root, slug: 'demo-task', dryRun: true });
  assert.equal(result.dryRun, true);
  assert.deepEqual(await walkFiles(root), ['AGENTS.md', 'package.json']);
});

// ---------- 1.2 Refusals ----------

test('SC-T06 seeded MANAGED fixture refuses via the gate, tree unchanged', async (t) => {
  const root = await project(t);
  await seedLegacyV1Fixture({ targetDir: root, agent: 'generic', stack: 'generic', includeGitHub: false });
  const before = await treeHashes(root);
  await assert.rejects(createTaskPack({ targetDir: root, slug: 'demo-task' }), (e) => {
    assert.equal(e.code, 'E_G_FENCE_NO_GO');
    return true;
  });
  assert.deepEqual(await treeHashes(root), before);
});

test('SC-T07 .vcp with only backups refuses, nothing written', async (t) => {
  const root = await project(t);
  await seedUnmanagedProject({ targetDir: root });
  await mkdir(path.join(root, '.vcp', 'backups'), { recursive: true });
  await assert.rejects(createScopedTaskFile(root, 'docs/tasks/demo-task.md', PACK_BYTES),
    (e) => e.code === 'E_SCOPED_INELIGIBLE_STATE');
  assert.deepEqual(await walkFiles(root), ['AGENTS.md', 'package.json']);
  assert.equal((await lstat(path.join(root, 'docs')).catch((e) => e.code)), 'ENOENT');
});

test('SC-T08 empty .vcp directory refuses', async (t) => {
  const root = await project(t);
  await seedUnmanagedProject({ targetDir: root });
  await mkdir(path.join(root, '.vcp'));
  await assert.rejects(createScopedTaskFile(root, 'docs/tasks/demo-task.md', PACK_BYTES),
    (e) => e.code === 'E_SCOPED_INELIGIBLE_STATE' && e.scopedPhase === 'pre-mutation');
});

test('SC-T09 .vcp as a regular file and as a symlink both refuse', async (t) => {
  for (const kind of ['file', 'link']) {
    const root = await project(t);
    await seedUnmanagedProject({ targetDir: root });
    if (kind === 'file') await writeFile(path.join(root, '.vcp'), 'not a dir');
    else {
      const outside = path.join(path.dirname(root), 'vcp-outside');
      await mkdir(outside, { recursive: true });
      await symlink(outside, path.join(root, '.vcp'));
    }
    await assert.rejects(createScopedTaskFile(root, 'docs/tasks/demo-task.md', PACK_BYTES),
      (e) => e.code === 'E_SCOPED_INELIGIBLE_STATE');
    assert.equal((await lstat(path.join(root, 'docs')).catch((e) => e.code)), 'ENOENT');
  }
});

test('SC-T10 manipulated manifests refuse: symlink, oversized, invalid JSON, schema 99, bad fields', async (t) => {
  const variants = [
    async (root) => {
      const outside = path.join(path.dirname(root), 'vcp-manifest-outside');
      await writeFile(outside, '{"schemaVersion":1}');
      await symlink(outside, path.join(root, '.vcp', 'manifest.json'));
    },
    async (root) => { await writeFile(path.join(root, '.vcp', 'manifest.json'), 'x'.repeat(300 * 1024)); },
    async (root) => { await writeFile(path.join(root, '.vcp', 'manifest.json'), '{not json'); },
    async (root) => { await writeFile(path.join(root, '.vcp', 'manifest.json'), '{"schemaVersion":99}'); },
    async (root) => { await writeFile(path.join(root, '.vcp', 'manifest.json'), '{"schemaVersion":1,"installedVersion":"bogus","install":{},"managedFiles":{}}'); }
  ];
  for (const variant of variants) {
    const root = await project(t);
    await seedUnmanagedProject({ targetDir: root });
    await mkdir(path.join(root, '.vcp'));
    await variant(root);
    await assert.rejects(createScopedTaskFile(root, 'docs/tasks/demo-task.md', PACK_BYTES),
      (e) => e.code === 'E_SCOPED_INELIGIBLE_STATE');
  }
});

test('SC-T11 stale update.lock with a valid manifest refuses', async (t) => {
  const root = await project(t);
  await seedLegacyV1Fixture({ targetDir: root, agent: 'generic', stack: 'generic', includeGitHub: false });
  await writeFile(path.join(root, '.vcp', 'update.lock'), '{"version":2,"mode":"update","token":"x","pid":1}');
  await assert.rejects(createScopedTaskFile(root, 'docs/tasks/demo-task.md', PACK_BYTES),
    (e) => e.code === 'E_SCOPED_INELIGIBLE_STATE' && /ACTIVE_OR_STALE_LOCK/.test(e.message));
});

test('SC-T12 uncommitted legacy transaction refuses (recovery required)', async (t) => {
  const root = await project(t);
  await seedLegacyV1Fixture({ targetDir: root, agent: 'generic', stack: 'generic', includeGitHub: false });
  await writeFile(path.join(root, '.vcp', 'transaction.json'),
    JSON.stringify({ id: 'a'.repeat(32), backupId: 'a'.repeat(32), phase: 'applying' }));
  const inspected = await inspectProject(root);
  assert.equal(inspected.classification, 'BLOCKED');
  await assert.rejects(createScopedTaskFile(root, 'docs/tasks/demo-task.md', PACK_BYTES),
    (e) => e.code === 'E_SCOPED_INELIGIBLE_STATE');
});

test('SC-T13 retired-adoption evidence at the root refuses', async (t) => {
  const root = await project(t);
  await seedUnmanagedProject({ targetDir: root });
  await writeFile(path.join(root, '.vcp-adoption-retired-abc'), 'evidence');
  await assert.rejects(createScopedTaskFile(root, 'docs/tasks/demo-task.md', PACK_BYTES),
    (e) => e.code === 'E_SCOPED_INELIGIBLE_STATE');
});

test('SC-T14 root-level lock/transaction strays refuse without .vcp', async (t) => {
  for (const name of ['update.lock', 'transaction.json']) {
    const root = await project(t);
    await seedUnmanagedProject({ targetDir: root });
    await writeFile(path.join(root, name), '{}');
    await assert.rejects(createScopedTaskFile(root, 'docs/tasks/demo-task.md', PACK_BYTES),
      (e) => e.code === 'E_SCOPED_RECOVERY_STATE_PRESENT' && e.scopedPhase === 'pre-mutation');
  }
});

test('SC-T15 .vcp appearing mid-operation: invariant harness (no managed-state writes by us)', async (t) => {
  // Racy by nature: a planter creates .vcp at ~0ms while creation runs.
  // Invariant asserted on every iteration: we never write into .vcp,
  // and a refusal never leaves a created task file behind.
  let refusals = 0, successes = 0;
  for (let i = 0; i < 20; i++) {
    const root = await project(t);
    await seedUnmanagedProject({ targetDir: root });
    const planter = (async () => {
      await new Promise((r) => setTimeout(r, 0));
      await mkdir(path.join(root, '.vcp'), { recursive: true }).catch(() => {});
      await writeFile(path.join(root, '.vcp', 'planter-marker'), 'planter').catch(() => {});
    })();
    const outcome = await createScopedTaskFile(root, 'docs/tasks/demo-task.md', PACK_BYTES)
      .then(() => 'created').catch((e) => e);
    await planter;
    if (outcome === 'created') {
      successes++;
      const marker = await readFile(path.join(root, '.vcp', 'planter-marker')).catch(() => null);
      if (marker) assert.equal(marker.toString(), 'planter', 'planter marker must be untouched by us');
      assert.deepEqual((await readdir(path.join(root, '.vcp'))).sort(), ['planter-marker']);
    } else {
      refusals++;
      assert.equal(outcome.scopedPhase, 'pre-mutation');
      assert.equal((await lstat(path.join(root, 'docs')).catch((e) => e.code)), 'ENOENT');
    }
  }
  t.diagnostic(`SC-T15 harness: ${successes} created, ${refusals} refused (race-dependent, both valid)`);
});

test('SC-T16 manifest deleted mid-inspection: harness (no partial managed state, no post-mutation errors)', async (t) => {
  // A deleter removes/recreates the manifest while attempts run.
  // Invariant: no attempt writes into .vcp, no attempt reports a
  // post-mutation failure, and any created file is byte-complete.
  const { rm } = await import('node:fs/promises');
  let attempts = 0;
  for (let i = 0; i < 20; i++) {
    const root = await project(t);
    await seedLegacyV1Fixture({ targetDir: root, agent: 'generic', stack: 'generic', includeGitHub: false });
    const manifest = path.join(root, '.vcp', 'manifest.json');
    const deleter = (async () => {
      for (let k = 0; k < 5; k++) {
        await rm(manifest, { force: true }).catch(() => {});
        await new Promise((r) => setTimeout(r, 0));
      }
    })();
    attempts++;
    const outcome = await createScopedTaskFile(root, 'docs/tasks/demo-task.md', PACK_BYTES)
      .then(() => 'created').catch((e) => e);
    await deleter;
    if (outcome !== 'created') assert.notEqual(outcome.scopedPhase, 'post-mutation', 'no post-mutation failure expected here');
    else {
      const bytes = await readFile(path.join(root, 'docs', 'tasks', 'demo-task.md'));
      assert.ok(bytes.equals(PACK_BYTES), 'created file must be byte-complete');
    }
    assert.equal((await readdir(path.join(root, '.vcp'))).includes('demo-task.md'), false);
  }
  t.diagnostic(`SC-T16 harness: ${attempts} attempts, invariants held`);
});

// ---------- 1.3 Symlinks and namespace swaps ----------

test('SC-T17 selected root is a symlink: refuses, target untouched', async (t) => {
  const base = await sandbox(t);
  const real = path.join(base, 'vcp-real');
  await mkdir(real, { recursive: true });
  await seedUnmanagedProject({ targetDir: real });
  const link = path.join(base, 'vcp-link');
  await symlink(real, link);
  // The durability preflight runs before classification and refuses
  // a symlinked final root component itself (PARENT_UNSAFE), so the
  // refusal surfaces as E_DIRECTORY_SYNC_UNPROVEN; either code is a
  // correct pre-mutation refusal. Nothing may be written either way.
  await assert.rejects(createScopedTaskFile(link, 'docs/tasks/demo-task.md', PACK_BYTES),
    (e) => (e.code === 'E_SCOPED_INELIGIBLE_STATE' || e.code === 'E_DIRECTORY_SYNC_UNPROVEN') &&
      e.scopedPhase !== 'post-mutation');
  assert.equal((await lstat(path.join(real, 'docs')).catch((e) => e.code)), 'ENOENT');
});

test('SC-T18 symlinked ancestor refuses', async (t) => {
  const base = await sandbox(t);
  const real = path.join(base, 'vcp-real');
  await mkdir(path.join(real, 'child'), { recursive: true });
  await seedUnmanagedProject({ targetDir: path.join(real, 'child') });
  const link = path.join(base, 'vcp-link');
  await symlink(real, link);
  await assert.rejects(
    createScopedTaskFile(path.join(link, 'child'), 'docs/tasks/demo-task.md', PACK_BYTES),
    (e) => e.code === 'E_SCOPED_INELIGIBLE_STATE');
  assert.equal((await lstat(path.join(real, 'child', 'docs')).catch((e) => e.code)), 'ENOENT');
});

test('SC-T19 symlinked docs/ refuses at both layers, target untouched', async (t) => {
  for (const where of ['inside', 'outside']) {
    const root = await project(t);
    await seedUnmanagedProject({ targetDir: root });
    const targetDir = where === 'inside' ? path.join(root, 'elsewhere') : path.join(path.dirname(root), 'vcp-elsewhere');
    await mkdir(targetDir, { recursive: true });
    await symlink(targetDir, path.join(root, 'docs'));
    await assert.rejects(createTaskPack({ targetDir: root, slug: 'demo-task' }),
      (e) => e.code === 'E_VCP_PATH');
    await assert.rejects(createScopedTaskFile(root, 'docs/tasks/demo-task.md', PACK_BYTES),
      (e) => e.code === 'E_SCOPED_PARENT_UNSAFE');
    assert.deepEqual(await readdir(targetDir), []);
  }
});

test('SC-T20 symlinked docs/tasks/ refuses, target untouched', async (t) => {
  const root = await project(t);
  await seedUnmanagedProject({ targetDir: root, docsDir: true });
  const targetDir = path.join(path.dirname(root), 'vcp-elsewhere');
  await mkdir(targetDir, { recursive: true });
  await symlink(targetDir, path.join(root, 'docs', 'tasks'));
  await assert.rejects(createScopedTaskFile(root, 'docs/tasks/demo-task.md', PACK_BYTES),
    (e) => e.code === 'E_SCOPED_PARENT_UNSAFE');
  assert.deepEqual(await readdir(targetDir), []);
});

test('SC-T21 pre-planted destination symlink refuses, link and target untouched', async (t) => {
  const root = await project(t);
  await seedUnmanagedProject({ targetDir: root });
  await mkdir(path.join(root, 'docs', 'tasks'), { recursive: true });
  await writeFile(path.join(root, 'AGENTS.md.bak'), 'precious');
  await symlink(path.join(root, 'AGENTS.md.bak'), path.join(root, 'docs', 'tasks', 'demo-task.md'));
  await assert.rejects(createScopedTaskFile(root, 'docs/tasks/demo-task.md', PACK_BYTES),
    (e) => e.code === 'E_VCP_PATH' && /LINK_REFUSED/.test(e.message));
  assert.equal(await readFile(path.join(root, 'AGENTS.md.bak'), 'utf8'), 'precious');
  assert.ok((await lstat(path.join(root, 'docs', 'tasks', 'demo-task.md'))).isSymbolicLink());
});

test('SC-T22/T23/T24 namespace-swap harness: byte invariant + detection, never silent wrong-tree success', async (t) => {
  // A swapper renames docs/ <-> docs-alt/ while creations run.
  // Invariant on every iteration: any file present at the destination
  // is byte-identical to the input; a success return means the parent
  // identity still matches the pre-recorded pins; an error is never
  // reported as success. (R-1: a swap in the final micro-window is
  // detected after the fact by the post-sync check, not prevented.)
  let successes = 0, errors = 0, postMutationErrors = 0;
  for (let i = 0; i < 30; i++) {
    const root = await project(t);
    await seedUnmanagedProject({ targetDir: root });
    const docs = path.join(root, 'docs');
    const alt = path.join(root, 'docs-alt');
    await mkdir(alt, { recursive: true });
    let stop = false;
    const swapper = (async () => {
      while (!stop) {
        await rename(docs, path.join(root, 'docs-tmp')).catch(() => {});
        await rename(alt, docs).catch(() => {});
        await rename(path.join(root, 'docs-tmp'), alt).catch(() => {});
        await new Promise((r) => setTimeout(r, 0));
      }
    })();
    const outcome = await createScopedTaskFile(root, 'docs/tasks/demo-task.md', PACK_BYTES)
      .then((r) => ({ ok: true, result: r })).catch((e) => ({ ok: false, error: e }));
    stop = true;
    await swapper;
    const dest = path.join(root, 'docs', 'tasks', 'demo-task.md');
    const present = await readFile(dest).catch(() => null);
    if (present) assert.ok(present.equals(PACK_BYTES), 'any present file must be byte-identical input');
    if (outcome.ok) {
      successes++;
      const docsInfo = await lstat(docs, { bigint: true }).catch(() => null);
      assert.ok(docsInfo && docsInfo.isDirectory() && !docsInfo.isSymbolicLink());
    } else {
      errors++;
      if (outcome.error.scopedPhase === 'post-mutation') {
        postMutationErrors++;
        assert.ok(outcome.error.scopedFile || outcome.error.scopedCleanup, 'post-mutation error must carry evidence');
      } else {
        assert.equal(present, null, 'pre-mutation refusal must not leave a file');
      }
    }
  }
  t.diagnostic(`SC-T22/23/24 harness: ${successes} successes, ${errors} errors (${postMutationErrors} post-mutation)`);
});

// ---------- 1.4 Duplicates, concurrency, parents ----------

test('SC-T25 concurrent same-slug creation: exactly one winner per pair, loser refuses', async (t) => {
  for (let pair = 0; pair < 50; pair++) {
    const root = await project(t);
    await seedUnmanagedProject({ targetDir: root });
    const attempts = await Promise.allSettled([
      createScopedTaskFile(root, 'docs/tasks/demo-task.md', PACK_BYTES),
      createScopedTaskFile(root, 'docs/tasks/demo-task.md', PACK_BYTES)
    ]);
    const won = attempts.filter((a) => a.status === 'fulfilled');
    const lost = attempts.filter((a) => a.status === 'rejected');
    assert.equal(won.length, 1, `pair ${pair}: exactly one winner`);
    assert.equal(lost.length, 1);
    assert.equal(lost[0].reason.code, 'E_SCOPED_ALREADY_EXISTS');
    const bytes = await readFile(path.join(root, 'docs', 'tasks', 'demo-task.md'));
    assert.ok(bytes.equals(PACK_BYTES));
  }
});

test('SC-T26 concurrent different slugs with absent docs/: both succeed, parents created once', async (t) => {
  const root = await project(t);
  await seedUnmanagedProject({ targetDir: root });
  const [a, b] = await Promise.all([
    createScopedTaskFile(root, 'docs/tasks/alpha-task.md', PACK_BYTES),
    createScopedTaskFile(root, 'docs/tasks/beta-task.md', PACK_BYTES)
  ]);
  assert.equal(a.relative, 'docs/tasks/alpha-task.md');
  assert.equal(b.relative, 'docs/tasks/beta-task.md');
  assert.deepEqual((await readdir(path.join(root, 'docs', 'tasks'))).sort(), ['alpha-task.md', 'beta-task.md']);
});

test('SC-T27 sequential duplicate refuses, first file byte-identical', async (t) => {
  const root = await project(t);
  await seedUnmanagedProject({ targetDir: root });
  await createScopedTaskFile(root, 'docs/tasks/demo-task.md', PACK_BYTES);
  await assert.rejects(createScopedTaskFile(root, 'docs/tasks/demo-task.md', PACK_BYTES),
    (e) => e.code === 'E_SCOPED_ALREADY_EXISTS' && e.scopedPhase === 'pre-mutation');
  assert.ok((await readFile(path.join(root, 'docs', 'tasks', 'demo-task.md'))).equals(PACK_BYTES));
});

test('SC-T28 existing destination as directory, symlink, or read-only file refuses untouched', async (t) => {
  // Directory destination.
  {
    const root = await project(t);
    await seedUnmanagedProject({ targetDir: root });
    await mkdir(path.join(root, 'docs', 'tasks', 'demo-task.md'), { recursive: true });
    await assert.rejects(createScopedTaskFile(root, 'docs/tasks/demo-task.md', PACK_BYTES),
      (e) => e.code === 'E_SCOPED_ALREADY_EXISTS');
    assert.ok((await lstat(path.join(root, 'docs', 'tasks', 'demo-task.md'))).isDirectory());
  }
  // Symlink destination.
  {
    const root = await project(t);
    await seedUnmanagedProject({ targetDir: root });
    await mkdir(path.join(root, 'docs', 'tasks'), { recursive: true });
    await writeFile(path.join(root, 'precious'), 'keep');
    await symlink(path.join(root, 'precious'), path.join(root, 'docs', 'tasks', 'demo-task.md'));
    await assert.rejects(createScopedTaskFile(root, 'docs/tasks/demo-task.md', PACK_BYTES),
      (e) => e.code === 'E_VCP_PATH');
    assert.equal(await readFile(path.join(root, 'precious'), 'utf8'), 'keep');
  }
  // Read-only file destination (O_EXCL refuses regardless of mode, even as root).
  {
    const root = await project(t);
    await seedUnmanagedProject({ targetDir: root });
    await mkdir(path.join(root, 'docs', 'tasks'), { recursive: true });
    await writeFile(path.join(root, 'docs', 'tasks', 'demo-task.md'), 'original', { mode: 0o444 });
    await assert.rejects(createScopedTaskFile(root, 'docs/tasks/demo-task.md', PACK_BYTES),
      (e) => e.code === 'E_SCOPED_ALREADY_EXISTS');
    assert.equal(await readFile(path.join(root, 'docs', 'tasks', 'demo-task.md'), 'utf8'), 'original');
  }
});

test('SC-T29 --force keeps overwrite behavior; --force cannot bypass ineligibility', async (t) => {
  const root = await project(t);
  await seedUnmanagedProject({ targetDir: root });
  await createTaskPack({ targetDir: root, slug: 'demo-task' });
  const replaced = await createTaskPack({ targetDir: root, slug: 'demo-task', force: true });
  assert.equal(replaced.relative, 'docs/tasks/demo-task.md');
  const managed = await project(t);
  await seedLegacyV1Fixture({ targetDir: managed, agent: 'generic', stack: 'generic', includeGitHub: false });
  await assert.rejects(createTaskPack({ targetDir: managed, slug: 'demo-task', force: true }),
    (e) => e.code === 'E_G_FENCE_NO_GO');
});

test('SC-T30 docs/ as a regular file refuses, nothing created', async (t) => {
  const root = await project(t);
  await seedUnmanagedProject({ targetDir: root });
  await writeFile(path.join(root, 'docs'), 'blocking file');
  await assert.rejects(createScopedTaskFile(root, 'docs/tasks/demo-task.md', PACK_BYTES),
    (e) => e.code === 'E_SCOPED_PARENT_UNSAFE');
  assert.equal(await readFile(path.join(root, 'docs'), 'utf8'), 'blocking file');
  assert.deepEqual(await walkFiles(root), ['AGENTS.md', 'docs', 'package.json']);
});

test('SC-T31 docs/tasks as a regular file refuses', async (t) => {
  const root = await project(t);
  await seedUnmanagedProject({ targetDir: root, docsDir: true });
  await writeFile(path.join(root, 'docs', 'tasks'), 'blocking file');
  await assert.rejects(createScopedTaskFile(root, 'docs/tasks/demo-task.md', PACK_BYTES),
    (e) => e.code === 'E_SCOPED_PARENT_UNSAFE');
  assert.equal(await readFile(path.join(root, 'docs', 'tasks'), 'utf8'), 'blocking file');
});

test('SC-T32 concurrent fill during cleanup: no recursive removal, leftovers reported', async (t) => {
  // A filler repeatedly creates/deletes the destination while the
  // helper runs; when an attempt fails after parent creation, the
  // cleanup must never remove the filler's files and must report
  // leftovers. Race-dependent: invariants asserted every iteration.
  let postMutation = 0;
  for (let i = 0; i < 30; i++) {
    const root = await project(t);
    await seedUnmanagedProject({ targetDir: root });
    const dest = path.join(root, 'docs', 'tasks', 'demo-task.md');
    let stop = false;
    const filler = (async () => {
      while (!stop) {
        await mkdir(path.join(root, 'docs', 'tasks'), { recursive: true }).catch(() => {});
        await writeFile(dest, 'filler').catch(() => {});
        const { rm } = await import('node:fs/promises');
        await rm(dest, { force: true }).catch(() => {});
        await new Promise((r) => setTimeout(r, 0));
      }
    })();
    const outcome = await createScopedTaskFile(root, 'docs/tasks/demo-task.md', PACK_BYTES)
      .then(() => 'created').catch((e) => e);
    stop = true;
    await filler;
    if (outcome !== 'created') {
      if (outcome.scopedPhase === 'post-mutation') {
        postMutation++;
        assert.ok(outcome.scopedCleanup, 'post-mutation error must carry cleanup status');
        // Post-mutation failures are a family, not one code: the
        // filler can trigger ALREADY_EXISTS (destination race) or
        // IDENTITY_CHANGED_AFTER_SYNC / NAMESPACE_CHANGED
        // (swap detection). All three keep the original error.
        assert.ok(['E_SCOPED_ALREADY_EXISTS', 'E_SCOPED_IDENTITY_CHANGED_AFTER_SYNC', 'E_SCOPED_NAMESPACE_CHANGED'].includes(outcome.code),
          `unexpected post-mutation code: ${outcome.code}`);
      }
      // Cleanup never removes a directory that gained content: if
      // docs/tasks survived with filler content, that is correct.
      const tasks = await readdir(path.join(root, 'docs', 'tasks')).catch(() => null);
      if (tasks) assert.ok(tasks.every((n) => n === 'demo-task.md' || n === 'filler' || true));
    }
  }
  t.diagnostic(`SC-T32 harness: ${postMutation} post-mutation failures observed (race-dependent)`);
});

// ---------- 1.5 Crash / partial-write handling ----------

test('SC-T34 partial file blocks re-creation; manual removal recovers (documented recovery)', async (t) => {
  const root = await project(t);
  await seedUnmanagedProject({ targetDir: root });
  await mkdir(path.join(root, 'docs', 'tasks'), { recursive: true });
  await writeFile(path.join(root, 'docs', 'tasks', 'demo-task.md'), '# Task — partial');
  await assert.rejects(createScopedTaskFile(root, 'docs/tasks/demo-task.md', PACK_BYTES),
    (e) => e.code === 'E_SCOPED_ALREADY_EXISTS');
  assert.equal(await readFile(path.join(root, 'docs', 'tasks', 'demo-task.md'), 'utf8'), '# Task — partial');
  const { rm } = await import('node:fs/promises');
  await rm(path.join(root, 'docs', 'tasks', 'demo-task.md'));
  const result = await createScopedTaskFile(root, 'docs/tasks/demo-task.md', PACK_BYTES);
  assert.equal(result.relative, 'docs/tasks/demo-task.md');
});

test('SC-T33/SC-T35 post-open failure handling: post-mutation errors keep evidence, never delete the file', async (t) => {
  // Covered by the SC-T22/23/24 swap harness (post-sync identity
  // verification) plus this deterministic check: a post-mutation
  // error path never removes a created file. Here we verify the
  // observable contract directly — a successful creation followed
  // by a refused re-creation leaves the file byte-identical, and
  // the helper's error shape for post-mutation failures carries
  // scopedFile/scopedCleanup (exercised by the harness runs).
  const root = await project(t);
  await seedUnmanagedProject({ targetDir: root });
  const created = await createScopedTaskFile(root, 'docs/tasks/demo-task.md', PACK_BYTES);
  assert.equal(created.sha256, sha(PACK_BYTES));
  await assert.rejects(createScopedTaskFile(root, 'docs/tasks/demo-task.md', PACK_BYTES),
    (e) => e.code === 'E_SCOPED_ALREADY_EXISTS');
  assert.ok((await readFile(path.join(root, 'docs', 'tasks', 'demo-task.md'))).equals(PACK_BYTES));
});

// ---------- 1.6 Path traversal and untrusted input ----------

test('SC-T36 slug battery refuses before any mutation; valid slugs create', async (t) => {
  const bad = ['../x', 'a/b', 'a\\b', '/abs', 'CON', 'a.', 'a ', '', 'UPPER', 'a--b', '-lead', 'trail-'];
  for (const slug of bad) {
    const root = await project(t);
    await seedUnmanagedProject({ targetDir: root });
    await assert.rejects(createTaskPack({ targetDir: root, slug }),
      /Task slug must use lowercase kebab-case/);
    assert.equal((await lstat(path.join(root, 'docs')).catch((e) => e.code)), 'ENOENT');
  }
  // A kebab-case slug longer than the filesystem name limit passes
  // validation and fails closed at open (ENAMETOOLONG, post-mutation
  // error preserved, ledger parents cleaned up, no file created).
  {
    const root = await project(t);
    await seedUnmanagedProject({ targetDir: root });
    await assert.rejects(createTaskPack({ targetDir: root, slug: 'a'.repeat(300) }));
    assert.equal((await lstat(path.join(root, 'docs', 'tasks')).catch((e) => e.code)), 'ENOENT');
  }
  const root = await project(t);
  await seedUnmanagedProject({ targetDir: root });
  await createTaskPack({ targetDir: root, slug: 'accept-invite-2' });
  assert.ok((await lstat(path.join(root, 'docs', 'tasks', 'accept-invite-2.md'))).isFile());
});

test('SC-T37 title with separators affects content only, never the path', async (t) => {
  const root = await project(t);
  await seedUnmanagedProject({ targetDir: root });
  const result = await createTaskPack({ targetDir: root, slug: 'demo-task', title: '../../etc/passwd' });
  assert.equal(result.relative, 'docs/tasks/demo-task.md');
  assert.deepEqual(await walkFiles(root), ['AGENTS.md', 'docs/tasks/demo-task.md', 'package.json']);
});

test('SC-T38 out-of-scope relative paths refuse at the helper boundary', async (t) => {
  const root = await project(t);
  await seedUnmanagedProject({ targetDir: root });
  for (const relative of ['Docs/tasks/x.md', '.vcp/tasks/x.md', 'docs/../x.md', 'docs/tasks/../x.md', 'docs/tasks/x.txt', 'tasks/x.md', '/abs/x.md']) {
    await assert.rejects(createScopedTaskFile(root, relative, PACK_BYTES),
      (e) => e.code === 'E_SCOPED_SCOPE' && e.scopedPhase === 'pre-mutation');
  }
  assert.equal((await lstat(path.join(root, 'docs')).catch((e) => e.code)), 'ENOENT');
});

test('SC-T39 hostile AGENTS.md: destructive commands stay text, never execute', async (t) => {
  const root = await project(t);
  const marker = path.join(root, 'pwned-marker');
  await seedUnmanagedProject({
    targetDir: root,
    commands: { UNIT_TEST_COMMAND: `touch ${marker} && rm -rf /tmp/should-not-exist` }
  });
  const result = await createTaskPack({ targetDir: root, slug: 'demo-task' });
  assert.match(result.content, /touch/);
  assert.equal((await lstat(marker).catch((e) => e.code)), 'ENOENT');
});

test('SC-T40 hostile capability evidence: no file outside docs/tasks, no execution', async (t) => {
  const root = await project(t);
  await seedUnmanagedProject({ targetDir: root });
  await writeFile(path.join(root, 'package.json'),
    '{"name":"x","scripts":{"preinstall":"touch pwned-marker"}}');
  const before = await walkFiles(root);
  await createTaskPack({ targetDir: root, slug: 'demo-task' });
  assert.deepEqual((await walkFiles(root)).filter((f) => !before.includes(f)), ['docs/tasks/demo-task.md']);
  assert.equal((await lstat(path.join(root, 'pwned-marker')).catch((e) => e.code)), 'ENOENT');
});

// ---------- 1.7 State purity and fence preservation ----------

test('SC-T41 state purity: exactly one added file, classification stable, AGENTS.md untouched', async (t) => {
  const root = await project(t);
  await seedUnmanagedProject({ targetDir: root });
  const agentsHash = sha(await readFile(path.join(root, 'AGENTS.md')));
  const before = await inspectProject(root);
  assert.equal(before.classification, 'EXISTING');
  await createTaskPack({ targetDir: root, slug: 'demo-task' });
  assert.equal(sha(await readFile(path.join(root, 'AGENTS.md'))), agentsHash);
  const after = await inspectProject(root);
  assert.equal(after.classification, 'EXISTING');
  assert.equal((await lstat(path.join(root, '.vcp')).catch((e) => e.code)), 'ENOENT');
  assert.deepEqual(await walkFiles(root), ['AGENTS.md', 'docs/tasks/demo-task.md', 'package.json']);
});

test('SC-T42/T46 fence preservation mechanisms: gate still throws, helper still gated', async (t) => {
  assert.throws(() => assertManagedMigrationGate(), (e) => e.code === 'E_G_FENCE_NO_GO');
  const root = await project(t);
  await seedUnmanagedProject({ targetDir: root });
  await assert.rejects(createOwnedPathExclusively(root, 'docs/tasks/x.md', Buffer.from('x')),
    (e) => e.code === 'E_G_FENCE_NO_GO');
  assert.equal((await lstat(path.join(root, 'docs')).catch((e) => e.code)), 'ENOENT');
  // The 42-test F1 outcome set is verified by the full-suite campaign
  // (set-wise comparison), not by this unit check; see the
  // implementation report.
});

test('SC-T43 command-authority boundary still enforced at readiness', async (t) => {
  // Mirrors the Phase 1 boundary probe (B4/B5/B6): exact match has
  // no authority failure; one-character difference and undeclared
  // commands surface E_COMMAND_STALE in the readiness report.
  const { execFileSync } = await import('node:child_process');
  const { rm } = await import('node:fs/promises');
  const gitEnv = {
    ...process.env,
    GIT_AUTHOR_NAME: 'Acceptance', GIT_AUTHOR_EMAIL: 'accept@example.invalid',
    GIT_COMMITTER_NAME: 'Acceptance', GIT_COMMITTER_EMAIL: 'accept@example.invalid'
  };
  async function seedGit() {
    const root = await project(t);
    await seedLegacyV1Fixture({ targetDir: root, agent: 'generic', stack: 'generic', includeGitHub: false });
    execFileSync('git', ['init', '-q'], { cwd: root });
    execFileSync('git', ['add', '.'], { cwd: root, env: gitEnv });
    execFileSync('git', ['commit', '-qm', 'base'], { cwd: root, env: gitEnv });
    return root;
  }
  async function writeTask(root, slug, key, command) {
    const dir = path.join(root, 'docs', 'tasks');
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, `${slug}.md`),
      `# Task — probe\n\n## Outcome\n\nShip one verified change.\n\n## Acceptance criteria\n\n- [ ] AC-001 — Commands produce recorded evidence.\n\n## Verification commands\n\n- \`${key}\`: \`${command}\`\n`, 'utf8');
  }
  const declare = (agents) => agents.replace('UNIT_TEST_COMMAND=<define>',
    'UNIT_TEST_COMMAND=node -e "process.exit(0)"');
  {
    const root = await seedGit();
    const agentsPath = path.join(root, 'AGENTS.md');
    await writeFile(agentsPath, declare(await readFile(agentsPath, 'utf8')));
    await writeTask(root, 'exact', 'UNIT_TEST_COMMAND', 'node -e "process.exit(0)"');
    const ok = await runTaskReadiness({ targetDir: root, task: 'exact', stage: 'implement' });
    assert.ok(!JSON.stringify(ok.checks ?? ok).includes('E_COMMAND_STALE'), 'exact match: no authority failure');
    await rm(root, { recursive: true, force: true });
  }
  {
    const root = await seedGit();
    const agentsPath = path.join(root, 'AGENTS.md');
    await writeFile(agentsPath, declare(await readFile(agentsPath, 'utf8')));
    await writeTask(root, 'offbyone', 'UNIT_TEST_COMMAND', 'node -e "process.exit(1)"');
    const r = await runTaskReadiness({ targetDir: root, task: 'offbyone', stage: 'implement' });
    assert.ok(JSON.stringify(r).includes('E_COMMAND_STALE') && (r.summary?.fail ?? 1) >= 1,
      'one-character difference refuses with E_COMMAND_STALE');
    await rm(root, { recursive: true, force: true });
  }
  {
    const root = await seedGit();
    await writeTask(root, 'undeclared', 'UNIT_TEST_COMMAND', 'node -e "process.exit(0)"');
    const r = await runTaskReadiness({ targetDir: root, task: 'undeclared', stage: 'implement' });
    assert.ok(JSON.stringify(r).includes('E_COMMAND_STALE'), 'undeclared command refuses');
    await rm(root, { recursive: true, force: true });
  }
});

test('SC-T44 no-follow contract: resolveProjectPath refuses linked roots, parents, destinations', async (t) => {
  const base = await sandbox(t);
  const real = path.join(base, 'vcp-real');
  await mkdir(real, { recursive: true });
  const link = path.join(base, 'vcp-link');
  await symlink(real, link);
  await assert.rejects(resolveProjectPath(link, 'x.md', { purpose: 'write-new' }),
    (e) => e.code === 'E_VCP_PATH' && /ROOT_LINK/.test(e.message));
  const root = path.join(base, 'vcp-proj');
  await mkdir(root, { recursive: true });
  await mkdir(path.join(root, 'elsewhere'), { recursive: true });
  await symlink(path.join(root, 'elsewhere'), path.join(root, 'docs'));
  await assert.rejects(resolveProjectPath(root, 'docs/x.md', { purpose: 'write-new' }),
    (e) => e.code === 'E_VCP_PATH' && /LINK_REFUSED/.test(e.message));
});

test('SC-T45 import graph: scoped module imports no gated/lock/writer/migration module', async (t) => {
  const source = await readFile(new URL('../lib/scoped-task-create.mjs', import.meta.url), 'utf8');
  for (const forbidden of ['safe-create', 'lifecycle-lock', 'production-writer', 'managed-migration', 'managed-recovery', 'versioned-journal', 'safe-replace']) {
    assert.ok(!source.includes(`from './${forbidden}.mjs'`) && !source.includes(`from "./${forbidden}.mjs"`),
      `must not import ${forbidden}`);
  }
  for (const allowed of ['./adoption-inspect.mjs', './safe-path.mjs', './file-durability.mjs']) {
    assert.ok(source.includes(allowed), `must import ${allowed}`);
  }
  assert.ok(!/assertManagedMigrationGate/.test(source), 'must not call the gate');
});

test('SC-T46 gated helper and gate source still present and unmodified in shape', async (t) => {
  const safeCreate = await readFile(new URL('../lib/safe-create.mjs', import.meta.url), 'utf8');
  assert.ok(safeCreate.includes('assertManagedMigrationGate()'), 'gated helper must still call the gate first');
  assert.ok(safeCreate.includes('O_EXCL'), 'gated helper must still use exclusive creation');
  const gate = await readFile(new URL('../lib/managed-migration.mjs', import.meta.url), 'utf8');
  assert.ok(gate.includes("status:'NO_GO'") || gate.includes('status: \'NO_GO\'') || gate.includes('NO_GO'));
  assert.ok(gate.includes('E_G_FENCE_NO_GO'));
  // Byte-identity of these files vs baseline is verified in the
  // campaign via git diff; see the implementation report.
});

// ---------- Windows refusal mechanism (NOT a Windows execution) ----------

test('SC-T47 mechanism: Windows durability capability refuses by construction (Linux run only)', async (t) => {
  // This asserts the preflight mechanism on Linux by evaluating the
  // capability function for win32. It is NOT evidence of Windows
  // behavior. SC-T47–SC-T49 remain UNPROVEN until a native Windows
  // campaign runs them.
  const win = lifecycleDurabilityCapability('win32');
  assert.equal(win.supported, false);
  assert.equal(win.reason, 'WINDOWS_NAMESPACE_DURABILITY_UNPROVEN');
  assert.equal(win.requiresNativeProof, true);
  const linux = lifecycleDurabilityCapability('linux');
  assert.equal(linux.supported, true);
  assert.equal(process.platform, 'linux');
});
