// Fixture helper for SC-01 tests: seeds a plain, never-managed project
// (NEW or EXISTING) with no .vcp entry of any kind. Mirrors the safety
// posture of legacy-v1-fixture.mjs: the caller must create the selected
// project directory inside a vcp-* OS-temp sandbox first, and every
// ancestor must pre-exist as a real directory. Never creates managed
// state.
import { lstat, mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

function refused(reason) {
  const error = new Error('Unmanaged test fixture refused: ' + reason);
  error.code = 'E_TEST_FIXTURE_UNSAFE';
  throw error;
}

export async function assertUnmanagedFixtureRoot(targetDir) {
  const selected = path.resolve(targetDir);
  const base = os.tmpdir();
  const within = path.relative(base, selected);
  if (path.isAbsolute(within) || !within.split(path.sep)[0].startsWith('vcp-')) {
    refused('must use an existing project inside a vcp-* OS-temp sandbox');
  }
  let at = selected;
  for (;;) {
    let meta;
    try { meta = await lstat(at); }
    catch (error) {
      if (error?.code === 'ENOENT' || error?.code === 'ENOTDIR') {
        refused('selected fixture project and ancestors must preexist');
      }
      throw error;
    }
    if (meta.isSymbolicLink() || !meta.isDirectory()) refused('linked or non-directory ancestor');
    const parent = path.dirname(at);
    if (parent === at) break;
    at = parent;
  }
  return selected;
}

export async function seedUnmanagedProject({
  targetDir, commands = { UNIT_TEST_COMMAND: 'npm test' }, includePackageJson = true, docsDir = false
} = {}) {
  const root = await assertUnmanagedFixtureRoot(targetDir);
  const state = await lstat(path.join(root, '.vcp')).catch((error) => {
    if (error?.code === 'ENOENT') return null;
    throw error;
  });
  if (state) refused('VCP state already exists');
  const agentsLines = Object.entries(commands).map(([key, value]) => `${key}=${value}`);
  await writeFile(path.join(root, 'AGENTS.md'), agentsLines.join('\n') + '\n', { flag: 'wx' });
  if (includePackageJson) {
    await writeFile(path.join(root, 'package.json'), '{"name":"unmanaged-fixture","private":true}\n', { flag: 'wx' });
  }
  if (docsDir) await mkdir(path.join(root, 'docs'), { recursive: true });
  return { targetDir: root, root };
}
