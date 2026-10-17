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
import { createOwnedFixture, withOwnedFixture } from './helpers/owned-fixture.mjs';
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
  // Leaked an mkdtemp directory before: teardown is now owned and in finally.
  await withOwnedFixture(() => createOwnedFixture('vcp-neg-'), async (dir) => {
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
  }, { mutationOutcome: 'known' });
});

test('Test 3 — invalid fixture: forged capability denied', async () => {
  await withOwnedFixture(() => createOwnedFixture('vcp-neg-'), async (dir) => {
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
  }, { mutationOutcome: 'known' });
});

test('Test 4 — path escape: capability scoped to fixture A denied for fixture B', async () => {
  const a = await createControlledFixture({ allowedOperations: ['probe'] });
  const b = await createControlledFixture({ allowedOperations: ['probe'] });
  // Teardown in finally: an assertion failure here used to leak both fixtures.
  try {
    let mutated = false;
    await assert.rejects(
      runWriterTransaction({
        root: b.root, operation: 'probe', testCapability: a.capability,
        mutate: async () => { mutated = true; },
      }),
      /E_TEST_CAPABILITY_SCOPE/
    );
    assert.equal(mutated, false);
  } finally {
    await teardownControlledFixture(a).catch(() => {});
    await teardownControlledFixture(b).catch(() => {});
  }
});

test('Test 5 — stale capability: reuse after teardown denied', async () => {
  const f = await createControlledFixture({ allowedOperations: ['probe'] });
  const cap = f.capability;
  await teardownControlledFixture(f);
  // After teardown the root is gone; the assertions below must not be able to
  // leave anything behind, so they run under an owned fixture wrapper.
  await withOwnedFixture(() => createOwnedFixture('vcp-neg-'), async () => {
    let mutated = false;
    await assert.rejects(
      runWriterTransaction({
        root: f.root, operation: 'probe', testCapability: cap,
        mutate: async () => { mutated = true; },
      }),
      /E_TEST_CAPABILITY_REVOKED/
    );
    assert.equal(mutated, false);
  }, { mutationOutcome: 'known' });
});

test('Test 6 — production entrypoint: gate still rejects without capability', async () => {
  // Even with the capability module loaded, production paths (no capability)
  // hit the production gate.
  await import('./helpers/controlled-writer-capability.mjs');
  await withOwnedFixture(() => createOwnedFixture('vcp-neg-'), async (dir) => {
    await assert.rejects(
      runWriterTransaction({
        root: dir, operation: 'probe', mutate: async () => {},
      }),
      (e) => e && e.code === 'E_G_FENCE_NO_GO'
    );
  }, { mutationOutcome: 'known' });
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

  // Detection is STATEMENT-scoped, not line-scoped. A line-scoped regex cannot
  // see the forms the 2026-10-17 review flagged as blind spots:
  //   import {\n  a,\n} from '../test/helpers/x.mjs';   (specifier not on the import line)
  //   export { a } from '../test/helpers/x.mjs';       (re-export, keyword is export)
  //   export * from '../test/helpers/x.mjs';
  // Comments are stripped first so commented-out imports are not counted as
  // violations, and dynamic import() stays allowed (it is capability-gated).
  const stripComments = (text) => text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
  // Not global: RegExp.prototype.test advances lastIndex on /g, which would make
  // repeated calls over the same control set return false negatives.
  const HELPER = String.raw`(?:\.\.\/|\.\/)+test\/helpers\/[^'"()\s]*`;
  const fromClause = new RegExp(
    `(?:^|[^\\w$.])(?:import|export)\\s[^;]*?\\bfrom\\s*['"]${HELPER}['"]`, 'm');
  const bareImport = new RegExp(`(?:^|[^\\w$.])import\\s*['"]${HELPER}['"]`, 'm');

  const scan = (text) => {
    const clean = stripComments(text);
    return fromClause.test(clean) || bareImport.test(clean);
  };

  // Negative control: prove the detector can fire. Without this, a broken
  // detector looks identical to a clean codebase.
  const POSITIVE = [
    ['single-line import', '// header\nimport { x } from \'../test/helpers/controlled-writer-capability.mjs\';\nexport const y = x;\n'],
    ['multi-line import', '// header\nimport {\n  mintCapabilityForFixture,\n} from \'../test/helpers/controlled-writer-capability.mjs\';\n'],
    ['named re-export', 'export { x } from \'../test/helpers/controlled-writer-capability.mjs\';\n'],
    ['star re-export', 'export * from \'../test/helpers/controlled-writer-capability.mjs\';\n'],
    ['bare side-effect import', 'import \'../test/helpers/controlled-writer-capability.mjs\';\n'],
  ];
  for (const [label, text] of POSITIVE)
    assert.equal(scan(text), true, `detector is blind to: ${label} — Test 7 would pass vacuously`);

  const NEGATIVE = [
    ['capability-gated dynamic import', '// header\nexport async function f(){ const m = await import(\'../test/helpers/controlled-writer-capability.mjs\'); return m; }\n'],
    ['commented-out static import', '// import { x } from \'../test/helpers/controlled-writer-capability.mjs\';\nexport const y = 1;\n'],
    ['block-commented import', '/* import { x } from \'../test/helpers/controlled-writer-capability.mjs\' */\nexport const y = 1;\n'],
    ['production-only relative import', 'import { a } from \'./paths.mjs\';\n'],
    ['identifier ending in import', 'const reimport = 1; reimport.from = 2;\n'],
  ];
  for (const [label, text] of NEGATIVE)
    assert.equal(scan(text), false, `detector must not flag: ${label}`);

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
