// Stage12 PR12.1a: SAFE preflight characterizations only.
// No schema2 enablement, reader extension, migration, journal mutation or real user projects.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { lstat, mkdir, mkdtemp, readFile, readlink, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { initProject } from '../lib/init.mjs';
import { readManifest } from '../lib/state.mjs';
import { assertPathInsideRoot, normalizeManagedPath } from '../lib/template.mjs';

async function fixture(t, prefix = 'vcp-stage12-1a-') {
  const root = await mkdtemp(path.join(os.tmpdir(), prefix));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}
function hash(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}
async function snapshotTree(root) {
  const items = [];
  async function walk(absolute, relative = '') {
    const list = await readdir(absolute, { withFileTypes: true });
    for (const item of list.sort((a, b) => a.name.localeCompare(b.name))) {
      const rel = relative ? relative + '/' + item.name : item.name;
      const full = path.join(absolute, item.name);
      const stat = await lstat(full);
      if (stat.isSymbolicLink()) {
        items.push([rel, 'link', await readlink(full)]);
      } else if (stat.isDirectory()) {
        items.push([rel + '/', 'dir']);
        await walk(full, rel);
      } else if (stat.isFile()) {
        items.push([rel, 'file', hash(await readFile(full)), stat.mode & 0o777]);
      } else {
        items.push([rel, 'special', stat.mode]);
      }
    }
  }
  await walk(root);
  return items;
}
function minimalManifest(schemaVersion) {
  return {
    schemaVersion, installedVersion: '0.9.3',
    install: { agent: 'generic', stack: 'auto', includeGitHub: false },
    managedFiles: {}, ignoredFiles: []
  };
}
async function putManifest(root, manifest) {
  await mkdir(path.join(root, '.vcp'), { recursive: true });
  await writeFile(path.join(root, '.vcp', 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
}

test('Stage12 preflight: existing schema-v1 read stays zero-write', async t => {
  const root = await fixture(t);
  await putManifest(root, minimalManifest(1));
  await writeFile(path.join(root, 'USER_NOTES.txt'), 'original untouched content\n');
  const before = await snapshotTree(root);
  const parsed = await readManifest(root);
  assert.equal(parsed.schemaVersion, 1);
  assert.deepEqual(await snapshotTree(root), before);
});

test('Stage12 preflight: unsupported future schema fails closed without mutations', async t => {
  const root = await fixture(t);
  await putManifest(root, minimalManifest(999999));
  await writeFile(path.join(root, 'USER_NOTES.txt'), 'preserve even on rejected schema\n');
  const before = await snapshotTree(root);
  await assert.rejects(readManifest(root), /newer than this CLI supports/i);
  assert.deepEqual(await snapshotTree(root), before);
});

test('Stage12 preflight: unreadable manifest JSON is rejected without rewriting bytes', async t => {
  const root = await fixture(t);
  await mkdir(path.join(root, '.vcp'));
  await writeFile(path.join(root, '.vcp', 'manifest.json'), '{"schemaVersion":');
  const before = await snapshotTree(root);
  await assert.rejects(readManifest(root), /Cannot read .*manifest\.json/i);
  assert.deepEqual(await snapshotTree(root), before);
});

test('Stage12 preflight: unmanaged existing-root init dry-run remains byte-identical', async t => {
  const root = await fixture(t);
  await writeFile(path.join(root, 'USER_NOTES.txt'), 'user-authored bytes\n');
  const before = await snapshotTree(root);
  const result = await initProject({
    targetDir: root, agent: 'generic', stack: 'auto',
    includeGitHub: false, dryRun: true
  });
  assert.equal(result.dryRun, true);
  assert.equal(Array.isArray(result.files), true);
  assert.deepEqual(await snapshotTree(root), before);
});

test('Stage12 preflight: unmanaged collision refuses and preserves the complete tree', async t => {
  const root = await fixture(t);
  await writeFile(path.join(root, 'AGENTS.md'), 'user-authored policy must not be replaced\n');
  await writeFile(path.join(root, 'USER_NOTES.txt'), 'extra user data\n');
  const before = await snapshotTree(root);
  await assert.rejects(initProject({
    targetDir: root, agent: 'generic',
    includeGitHub: false, dryRun: true, force: false
  }), /Refusing to overwrite existing framework files/);
  assert.deepEqual(await snapshotTree(root), before);
});

test('Stage12 preflight: managed relative path rejects parent traversal and reserved VCP state', () => {
  for (const relative of ['../escape', 'a/../../escape', '.vcp', '.vcp/manifest.json', '..\\escape']) {
    assert.throws(() => normalizeManagedPath(relative), /Unsafe managed path|Reserved managed path/i);
  }
  assert.equal(normalizeManagedPath('docs/valid.md'), 'docs/valid.md');
});

test('Stage12 preflight: existing path resolver rejects linked directory escape', async t => {
  const root = await fixture(t, 'vcp-stage12-inside-');
  const outside = await fixture(t, 'vcp-stage12-outside-');
  await writeFile(path.join(outside, 'secret.txt'), 'cannot traverse this link\n');
  try {
    await symlink(outside, path.join(root, 'linked'), process.platform === 'win32' ? 'junction' : 'dir');
  } catch (error) {
    if (['EPERM', 'EACCES', 'ENOTSUP', 'EOPNOTSUPP'].includes(error?.code)) {
      t.diagnostic('Symlink/junction creation unavailable; NOT proof of native-Windows path safety');
      t.skip('Filesystem does not permit link creation');
      return;
    }
    throw error;
  }
  const before = await snapshotTree(root);
  await assert.rejects(assertPathInsideRoot(root, 'linked/secret.txt'), /Refusing to follow symlink/);
  assert.deepEqual(await snapshotTree(root), before);
  assert.equal(await readFile(path.join(outside, 'secret.txt'), 'utf8'), 'cannot traverse this link\n');
});


test('Stage12 D-03 selected policy preflight: in-root directory symlinks are not trusted', async t => {
  const root = await fixture(t, 'vcp-stage12-inroot-');
  await mkdir(path.join(root, 'real'));
  await writeFile(path.join(root, 'real', 'user.txt'), 'private user content\n');
  try {
    await symlink(path.join(root, 'real'), path.join(root, 'alias'), process.platform === 'win32' ? 'junction' : 'dir');
  } catch (error) {
    if (['EPERM', 'EACCES', 'ENOTSUP', 'EOPNOTSUPP'].includes(error?.code)) {
      t.skip('Host cannot create symlink/junction; native Windows still UNVERIFIED');
      return;
    }
    throw error;
  }
  const before = await snapshotTree(root);
  await assert.rejects(assertPathInsideRoot(root, 'alias/user.txt'), /Refusing to follow symlink/);
  assert.deepEqual(await snapshotTree(root), before);
  assert.equal(await readFile(path.join(root, 'real', 'user.txt'), 'utf8'), 'private user content\n');
});

test('Stage12 D-03 selected policy preflight: linked manifest is rejected before read with no writes', async t => {
  const root = await fixture(t, 'vcp-stage12-linkedstate-');
  await mkdir(path.join(root, '.vcp'));
  await writeFile(path.join(root, '.vcp', 'stored.json'), JSON.stringify(minimalManifest(1)));
  try {
    await symlink(path.join(root, '.vcp', 'stored.json'), path.join(root, '.vcp', 'manifest.json'), 'file');
  } catch (error) {
    if (['EPERM', 'EACCES', 'ENOTSUP', 'EOPNOTSUPP'].includes(error?.code)) {
      t.skip('Host cannot create symlink; native Windows still UNVERIFIED');
      return;
    }
    throw error;
  }
  const before = await snapshotTree(root);
  await assert.rejects(readManifest(root), /Refusing to follow symlink/);
  assert.deepEqual(await snapshotTree(root), before);
});
