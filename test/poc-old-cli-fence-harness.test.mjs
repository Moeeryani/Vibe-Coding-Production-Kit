import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cli = path.join(root, 'scripts', 'poc-old-cli-fence.mjs');
function invoke(args) {
  return spawnSync(process.execPath, [cli, ...args], {
    cwd: root, encoding: 'utf8', timeout: 20000
  });
}

test('published-old-CLI POC harness file hashing self-test (not old binary)', () => {
  const r = invoke(['--self-test']);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /HARNESS_SELF_TEST_PASS/);
});
test('published-old-CLI POC refuses to claim evidence without npm tarball/integrity', () => {
  const r = invoke([]);
  assert.equal(r.status, 3, r.stdout + r.stderr);
  assert.match(r.stderr, /BLOCKED: published tarball/);
});
test('published-old-CLI POC documents observation scenarios', () => {
  const r = invoke(['--help']);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /rollback-v2-erases-user-edit/);
  assert.match(r.stdout, /directory-sentinel-rollback/);
  assert.match(r.stdout, /deleted-manifest-directory-sentinel-old-init/);
});
