// B-4/B-5 Phase C: security-negative tests for the controlled lane.
// These are NON-MUTATING: they prove denial. Safe to run without approval.
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  createControlledFixture, teardownControlledFixture, verifyFixtureIdentity,
} from './helpers/controlled-writer-fixture.mjs';
import { verifyTestCapability } from './helpers/controlled-writer-capability.mjs';
import { runWriterTransaction } from '../lib/production-writer.mjs';
import { rollbackV2 } from '../lib/writer-rollback-v2.mjs';

test('Test 1 — production root rejection: capability cannot target a real repo', async () => {
  // The fixture helper takes no path argument: it always creates a fresh
  // disposable root under os.tmpdir(). A capability minted for that fixture
  // is scope-pinned; directing it at the real repository root is denied.
  const f = await createControlledFixture({ allowedOperations: ['probe'] });
  assert.ok(f.root.startsWith(path.resolve(os.tmpdir()) + path.sep));
  const repoRoot = path.resolve(import.meta.dirname, '..');
  let mutated = false;
  await assert.rejects(
    runWriterTransaction({
      root: repoRoot, operation: 'probe', testCapability: f.capability,
      mutate: async () => { mutated = true; },
    }),
    /E_TEST_CAPABILITY_SCOPE/
  );
  assert.equal(mutated, false);
  await teardownControlledFixture(f);
});

test('Test 2 — missing capability: writer core denies without capability', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'vcp-neg-'));
  let mutated = false;
  await assert.rejects(
    runWriterTransaction({
      root: dir, operation: 'probe', mutate: async () => { mutated = true; },
    }),
    (e) => e && e.code === 'E_G_FENCE_NO_GO'
  );
  assert.equal(mutated, false);
  await assert.rejects(
    rollbackV2({ root: dir, backupId: 'x', confirmed: true }),
    (e) => e && e.code === 'E_G_FENCE_NO_GO'
  );
});

test('Test 3 — invalid fixture: forged capability denied', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'vcp-neg-'));
  const forged = { id: 'forged', fixtureRoot: dir, revoked: false };
  await assert.rejects(
    verifyTestCapability(forged, { root: dir, operation: 'probe' }),
    /E_TEST_CAPABILITY_INVALID/
  );
  let mutated = false;
  await assert.rejects(
    runWriterTransaction({
      root: dir, operation: 'probe', testCapability: forged,
      mutate: async () => { mutated = true; },
    }),
    /E_TEST_CAPABILITY_INVALID/
  );
  assert.equal(mutated, false);
});

test('Test 4 — path escape: capability scoped to fixture A denied for fixture B', async () => {
  const a = await createControlledFixture({ allowedOperations: ['probe'] });
  const b = await createControlledFixture({ allowedOperations: ['probe'] });
  let mutated = false;
  await assert.rejects(
    runWriterTransaction({
      root: b.root, operation: 'probe', testCapability: a.capability,
      mutate: async () => { mutated = true; },
    }),
    /E_TEST_CAPABILITY_SCOPE/
  );
  assert.equal(mutated, false);
  await teardownControlledFixture(a);
  await teardownControlledFixture(b);
});

test('Test 5 — stale capability: reuse after teardown denied', async () => {
  const f = await createControlledFixture({ allowedOperations: ['probe'] });
  const cap = f.capability;
  await teardownControlledFixture(f);
  let mutated = false;
  await assert.rejects(
    runWriterTransaction({
      root: f.root, operation: 'probe', testCapability: cap,
      mutate: async () => { mutated = true; },
    }),
    /E_TEST_CAPABILITY_REVOKED/
  );
  assert.equal(mutated, false);
});

test('Test 6 — production entrypoint: gate still rejects without capability', async () => {
  // Even with the capability module loaded, production paths (no capability)
  // hit the production gate.
  await import('./helpers/controlled-writer-capability.mjs');
  const dir = await mkdtemp(path.join(os.tmpdir(), 'vcp-neg-'));
  await assert.rejects(
    runWriterTransaction({
      root: dir, operation: 'probe', mutate: async () => {},
    }),
    (e) => e && e.code === 'E_G_FENCE_NO_GO'
  );
});

// Test 7 previously shelled out to `grep -rl ... 2>/dev/null || true`, which
// aborts on Windows (cmd re-parses the redirections and the shell builtins).
// That is a portability defect in the harness, not a security finding: the
// property is checked here natively, so it holds on every platform.
test('Test 7 — package exclusion: test helpers not in production surface', async () => {
  const pkg = (await import('../package.json', { with: { type: 'json' } })).default;
  const files = pkg.files || [];
  assert.ok(!files.some((f) => f.startsWith('test/')), 'test/ must not be in package files');

  const { readdir, readFile } = await import('node:fs/promises');
  const libDir = path.resolve(import.meta.dirname, '..', 'lib');
  const entries = await readdir(libDir);
  const names = entries.filter((n) => n.endsWith('.mjs'));
  assert.ok(names.length > 0, 'lib/ contained no .mjs files — exclusion scan would be vacuous');

  // Line-scoped detection: a bare /^import/ against the whole file text is
  // anchored at byte 0 and therefore never matches a file that begins with a
  // comment — which is every file in lib/. That made this check pass vacuously.
  const isStaticHelperImport = (line) =>
    /^\s*import\b/.test(line) && !/^\s*(?:const|let|var)?\s*\*?\s*import\s*\(/.test(line)
    && /['"]\.\.\/test\/helpers\//.test(line);

  const scan = (text) => text.split(/\r?\n/).some(isStaticHelperImport);

  // Negative control: prove the detector can fire. Without this, a broken
  // detector looks identical to a clean codebase.
  const POSITIVE = '// header\nimport { x } from \'../test/helpers/controlled-writer-capability.mjs\';\nexport const y = x;\n';
  assert.equal(scan(POSITIVE), true,
    'detector cannot see a real violation — Test 7 would pass vacuously');
  const NEGATIVE = '// header\nexport async function f(){ const m = await import(\'../test/helpers/controlled-writer-capability.mjs\'); return m; }\n';
  assert.equal(scan(NEGATIVE), false,
    'detector must not flag the capability-gated dynamic import');

  const offenders = [];
  for (const name of names) {
    const text = await readFile(path.join(libDir, name), 'utf8');
    if (scan(text)) offenders.push(name);
  }
  assert.deepEqual(offenders, [],
    `lib modules statically import test helpers: ${offenders.join(', ')}`);
  // The allowed case must still exist, or this assertion would pass vacuously
  // if someone deleted the capability-gated branch entirely.
  const productionWriter = await readFile(
    path.join(libDir, 'production-writer.mjs'), 'utf8');
  assert.match(productionWriter, /controlled-writer-capability\.mjs/,
    'capability-gated dynamic import vanished — exclusion test is now vacuous');
});

test('Test 8 — identity replacement: fixture swap detected', async () => {
  const f = await createControlledFixture({ allowedOperations: ['probe'] });
  // Simulate replacement: remove and recreate the fixture dir (new inode).
  const { rm, mkdir } = await import('node:fs/promises');
  await rm(f.root, { recursive: true, force: true });
  await mkdir(f.root, { recursive: true, mode: 0o700 });
  await assert.rejects(
    verifyTestCapability(f.capability, { root: f.root, operation: 'probe' }),
    /E_TEST_CAPABILITY_IDENTITY/
  );
  await assert.rejects(verifyFixtureIdentity(f), /E_FIXTURE_IDENTITY/);
  // Cleanup the orphaned dir manually (teardown would fail identity check).
  await rm(f.root, { recursive: true, force: true });
});
