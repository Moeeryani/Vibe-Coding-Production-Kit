// P4-02b — old-CLI 0.9.3 containment gate.
//
// The gate is the decision layer over the P4-01 hazard detector: it
// turns a hazard report plus a managed-state descriptor into a
// REFUSE / ALLOW_UNDER_TEST_ONLY decision. There is no
// ALLOW_PRODUCTION outcome in the code: production scope always
// refuses (D-01 DEFERRED, G-FENCE NO_GO, production writers
// DISABLED). The test scope is a test-only capability that requires
// BOTH --test-scope and the disposable-fixture opt-in; it authorizes
// a controlled-lane fixture run, never a production write.
//
// H4 (concurrent old/new writers, PH-06) is a residual risk on every
// ALLOW_UNDER_TEST_ONLY, never a refusal in test scope: the test
// scope runs a single writer by construction and the old CLI is not
// running concurrently in the fixture. In production scope
// everything refuses via G0 regardless.
//
// Rule order (lib/old-cli-containment.mjs): G0 scope, G1 EXPOSED,
// G2 linked root, G3 H3 interrupted/stray/adoption states, G4
// managed-state failures (manifest/journal/lock), G6 allow-under-test.
// The first matching rule wins; its code names the blocker.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, readdir, lstat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assessContainment, CONTAINMENT_VERSION } from '../lib/old-cli-containment.mjs';
import { assessHazardExposure } from '../lib/old-cli-hazard-exposure.mjs';
import { seedLegacyV1Fixture } from './helpers/legacy-v1-fixture.mjs';
import { constructAdaptiveManifest } from '../lib/manifest-v2.mjs';
import { getCliVersion } from '../lib/version.mjs';

const execFileAsync = promisify(execFile);
const CLI = path.join(path.dirname(fileURLToPath(import.meta.url)), '..',
  'bin', 'vibe-coding-production.mjs');
const TEST_SCOPE_ENV = { VCP_P4_TEST_SCOPE: 'I_UNDERSTAND_DISPOSABLE_ONLY' };

async function sandbox(t) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'vcp-p402b-'));
  t.after(async () => {
    const { rm } = await import('node:fs/promises');
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  });
  return dir;
}

async function treeHash(root) {
  const hash = createHash('sha256');
  async function walk(dir, rel) {
    const entries = (await readdir(dir)).sort();
    for (const name of entries) {
      const full = path.join(dir, name);
      const r = rel ? `${rel}/${name}` : name;
      const st = await lstat(full);
      if (st.isSymbolicLink()) {
        const { readlink } = await import('node:fs/promises');
        hash.update(`link:${r}:${await readlink(full)}\n`);
      } else if (st.isDirectory()) {
        hash.update(`dir:${r}\n`);
        await walk(full, r);
      } else if (st.isFile()) {
        hash.update(`file:${r}:${st.size}:`);
        hash.update(await readFile(full));
        hash.update('\n');
      } else {
        hash.update(`other:${r}\n`);
      }
    }
  }
  await walk(root, '');
  return hash.digest('hex');
}

async function runCli(args, env = {}) {
  try {
    const { stdout } = await execFileAsync(process.execPath,
      [CLI, ...args], { encoding: 'utf8', env: { ...process.env, ...env } });
    return { code: 0, stdout, stderr: '' };
  } catch (error) {
    return {
      code: error.code ?? 1,
      stdout: error.stdout ?? '',
      stderr: error.stderr ?? ''
    };
  }
}

// Descriptor shape shared with test/old-cli-hazard-exposure.test.mjs.
function baseDescriptor(overrides = {}) {
  return {
    root: '/nonexistent/assessed-root',
    classification: 'EXISTING',
    classificationReason: null,
    rootLinked: false,
    manifest: 'absent',
    updateLock: 'absent',
    transactionJson: 'absent',
    vcpDir: 'absent',
    rootManifestStray: false,
    userOwnedContentPresent: false,
    userOwnedSignals: [],
    interruptedState: false,
    adoptionMarkersPresent: false,
    ...overrides
  };
}

const CLEAN_MANAGED = {
  manifest: 'present-v2', journal: 'absent', lock: 'absent', isEmptyDir: false
};

const EMPTY_DIR = {
  manifest: 'absent', journal: 'absent', lock: 'absent', isEmptyDir: true
};

function decide({ operation, scope, descriptor = {}, managed = CLEAN_MANAGED }) {
  return assessContainment({
    operation, scope,
    hazardReport: assessHazardExposure(baseDescriptor(descriptor)),
    managedState: managed
  });
}

// The Issue #111 dangerous fixture: no manifest, directory-shaped
// root update.lock, user-edited AGENTS.md.
const DANGEROUS = {
  updateLock: 'directory',
  userOwnedContentPresent: true,
  userOwnedSignals: ['AGENTS.md', 'package.json']
};

function assertRefuse(decision, code) {
  assert.equal(decision.tool, 'vcp-containment');
  assert.equal(decision.version, CONTAINMENT_VERSION);
  assert.equal(decision.decision, 'REFUSE', JSON.stringify(decision));
  assert.equal(decision.code, code);
  assert.ok(decision.reasons.length >= 1, 'a refusal names its reason');
  assert.ok(decision.blockers.length >= 1, 'a refusal lists a blocker');
  assert.ok(decision.evidence.length >= 1, 'a refusal cites evidence');
}

function assertAllowUnderTest(decision) {
  assert.equal(decision.tool, 'vcp-containment');
  assert.equal(decision.version, CONTAINMENT_VERSION);
  assert.equal(decision.decision, 'ALLOW_UNDER_TEST_ONLY', JSON.stringify(decision));
  assert.equal(decision.code, null);
  assert.ok(decision.reasons.length >= 1);
  assert.ok(decision.residualRisks.length >= 1,
    'every allow carries residual risks, including H4/PH-06');
  assert.ok(decision.residualRisks.some((r) => /PH-06|single-writer|H4/.test(r)),
    'residual risks name the concurrent-writer (H4/PH-06) scope limit');
  assert.match(decision.noWriteGuarantee, /no writes/);
}

// ---------- Pure module ----------

test('pure containment gate performs zero I/O (no filesystem/process imports)', async () => {
  const source = await readFile(
    path.join(path.dirname(fileURLToPath(import.meta.url)), '..',
      'lib', 'old-cli-containment.mjs'), 'utf8');
  assert.equal(/^import\s/m.test(source), false, 'pure module must have no import statements');
  assert.equal(/\brequire\s*\(/.test(source), false, 'pure module must not require()');
  assert.equal(/from\s+['"]node:/.test(source), false, 'pure module must not import node: modules');
  assert.equal(/[^a-zA-Z]import\s*\(/.test(source), false, 'pure module must not dynamically import');
  assert.equal(source.includes('process.'), false, 'pure module must not touch process');
  assert.equal(source.includes('ALLOW_PRODUCTION'), false,
    'no ALLOW_PRODUCTION outcome may exist in the gate');
});

// ---------- Pure decision matrix (G-01–G-17) ----------

test('G-01: production scope refuses EXPOSED init (dangerous fixture)', () => {
  // G0 (scope) is checked before the hazard rule G1: production
  // scope refuses everything, and the refusal code names the scope,
  // not the hazard. The hazard rule is proven by G-02 in test scope.
  assertRefuse(
    decide({ operation: 'init', scope: 'production', descriptor: DANGEROUS, managed: EMPTY_DIR }),
    'E_CONTAINMENT_PRODUCTION_REFUSED');
});

test('G-02: test scope still refuses EXPOSED init (a proven hazard is not overridden by test scope)', () => {
  assertRefuse(
    decide({ operation: 'init', scope: 'disposable-test', descriptor: DANGEROUS, managed: EMPTY_DIR }),
    'E_CONTAINMENT_HAZARD_EXPOSED');
});

test('G-03: production scope refuses update on a clean managed project', () => {
  assertRefuse(
    decide({ operation: 'update', scope: 'production' }),
    'E_CONTAINMENT_PRODUCTION_REFUSED');
});

test('G-04: test scope allows update on a clean managed project, with residuals', () => {
  assertAllowUnderTest(decide({ operation: 'update', scope: 'disposable-test' }));
});

test('G-05: test scope allows rollback on a clean managed project, with residuals', () => {
  assertAllowUnderTest(decide({ operation: 'rollback', scope: 'disposable-test' }));
});

test('G-06: test scope allows manage on a clean managed project, with residuals', () => {
  assertAllowUnderTest(decide({ operation: 'manage', scope: 'disposable-test' }));
});

test('G-07: test scope allows init on an empty directory', () => {
  assertAllowUnderTest(
    decide({ operation: 'init', scope: 'disposable-test', descriptor: {}, managed: EMPTY_DIR }));
});

test('G-08: H4 is a residual risk, not a refusal, in test scope (docs-only non-empty dir)', () => {
  // The docs/-only state is UNKNOWN on init (no AGENTS.md POC
  // evidence). The concurrent-writer hazard H4 is recorded as a
  // residual risk on the allow, because the test scope runs a single
  // writer by construction and the old CLI is not running
  // concurrently in the fixture. In production scope the same state
  // refuses via G0 regardless.
  const decision = decide({
    operation: 'init', scope: 'disposable-test',
    descriptor: { userOwnedContentPresent: true, userOwnedSignals: ['docs/'] },
    managed: { ...EMPTY_DIR, isEmptyDir: false }
  });
  assertAllowUnderTest(decision);
  assertRefuse(
    decide({
      operation: 'init', scope: 'production',
      descriptor: { userOwnedContentPresent: true, userOwnedSignals: ['docs/'] },
      managed: { ...EMPTY_DIR, isEmptyDir: false }
    }),
    'E_CONTAINMENT_PRODUCTION_REFUSED');
});

test('G-09a: root transaction.json (interrupted state) refuses update in test scope', () => {
  assertRefuse(
    decide({ operation: 'update', scope: 'disposable-test',
      descriptor: { transactionJson: 'file', interruptedState: true } }),
    'E_CONTAINMENT_INTERRUPTED_STATE');
});

test('G-09b: partial .vcp journal refuses update in test scope (no H3 trigger)', () => {
  // The managed journal is .vcp/transaction.json; the root
  // transaction.json stays absent, so no H3 rule fires and the
  // journal rule G4 is the one that refuses.
  assertRefuse(
    decide({ operation: 'update', scope: 'disposable-test',
      managed: { ...CLEAN_MANAGED, journal: 'partial' } }),
    'E_CONTAINMENT_JOURNAL_NOT_CLEAN');
});

test('G-10: root manifest stray refuses rollback in test scope', () => {
  assertRefuse(
    decide({ operation: 'rollback', scope: 'disposable-test',
      descriptor: { rootManifestStray: true } }),
    'E_CONTAINMENT_INTERRUPTED_STATE');
});

test('G-11: linked root refuses update in test scope (OD-3 ROOT_LINK)', () => {
  assertRefuse(
    decide({ operation: 'update', scope: 'disposable-test',
      descriptor: { rootLinked: true } }),
    'E_CONTAINMENT_LINKED_ROOT');
});

test('G-12: update without a managed manifest refuses in test scope', () => {
  assertRefuse(
    decide({ operation: 'update', scope: 'disposable-test',
      managed: { ...CLEAN_MANAGED, manifest: 'absent' } }),
    'E_CONTAINMENT_MANIFEST_ABSENT');
});

test('G-13: directory-shaped .vcp/update.lock refuses update in test scope', () => {
  // The managed lock is .vcp/update.lock; the root lock stays
  // absent, so no H3 rule fires and the lock rule G4 is the one
  // that refuses.
  assertRefuse(
    decide({ operation: 'update', scope: 'disposable-test',
      managed: { ...CLEAN_MANAGED, lock: 'directory' } }),
    'E_CONTAINMENT_LOCK_ABNORMAL');
});

test('G-14: unreadable manifest refuses update in test scope', () => {
  assertRefuse(
    decide({ operation: 'update', scope: 'disposable-test',
      descriptor: { manifest: 'not-regular' },
      managed: { ...CLEAN_MANAGED, manifest: 'not-regular' } }),
    'E_CONTAINMENT_MANIFEST_UNREADABLE');
});

test('G-15: init on an already-managed (v2) project is allowed by containment in test scope', () => {
  // Containment answers whether the old CLI could damage the state;
  // the old init refuses an intact v2 project (POC scenario
  // intact-v2-old-init). The new CLI's own init still refuses an
  // already-managed project as already-managed — a separate, safe
  // lifecycle refusal, not a containment decision.
  assertAllowUnderTest(decide({ operation: 'init', scope: 'disposable-test' }));
});

test('G-15b: manifest present-v1 refuses every operation in test scope (migration deferred, D-01)', () => {
  for (const operation of ['init', 'update', 'manage', 'rollback']) {
    assertRefuse(
      decide({ operation, scope: 'disposable-test',
        managed: { ...CLEAN_MANAGED, manifest: 'present-v1' } }),
      'E_CONTAINMENT_LEGACY_MANIFEST');
  }
});

test('G-16: malformed inputs never throw and always refuse', () => {
  for (const input of [
    null, undefined, {}, { operation: 'init' }, { operation: 'explode', scope: 'disposable-test' },
    { operation: 'update', scope: 'somewhere-else' },
    { operation: 'update', scope: 'disposable-test', hazardReport: { version: 1 } },
    { operation: 'update', scope: 'disposable-test', hazardReport: null },
    { operation: 'update', scope: 'disposable-test', managedState: null },
    { operation: 'update', scope: 'disposable-test', managedState: { manifest: 'present-v2' } }
  ]) {
    const decision = assessContainment(input);
    assert.equal(decision.decision, 'REFUSE',
      `malformed input must refuse, got ${JSON.stringify(decision)} for ${JSON.stringify(input)}`);
    assert.ok(typeof decision.code === 'string' && decision.code.length > 0);
  }
});

test('G-17: production scope refuses all four operations on a clean managed project', () => {
  for (const operation of ['init', 'update', 'manage', 'rollback']) {
    assertRefuse(
      decide({ operation, scope: 'production' }),
      'E_CONTAINMENT_PRODUCTION_REFUSED');
  }
});

test('stale hazard report (version != 2) refuses in test scope', () => {
  const fresh = assessHazardExposure(baseDescriptor({}));
  // The hazard report is frozen; a stale report is built by copy.
  const stale = { ...fresh, version: 1 };
  const decision = assessContainment({
    operation: 'update', scope: 'disposable-test',
    hazardReport: stale, managedState: CLEAN_MANAGED
  });
  assertRefuse(decision, 'E_CONTAINMENT_STALE_HAZARD_REPORT');
});

// ---------- CLI ----------

// A clean v2 managed fixture: seed a valid v1 project, then convert
// its manifest to v2 with the product's own builder (which validates
// it). Managed schema-v2 writes are G-FENCE-blocked in the CLI, so
// the fixture is assembled, never created by running vcp init.
async function seedV2ManagedFixture(dir) {
  await seedLegacyV1Fixture({ targetDir: dir });
  const manifestPath = path.join(dir, '.vcp', 'manifest.json');
  const v1 = JSON.parse(await readFile(manifestPath, 'utf8'));
  const readerVersion = await getCliVersion();
  const v2 = constructAdaptiveManifest({ legacyShape: v1, assetSet: 'legacy-full-v1', readerVersion });
  await writeFile(manifestPath, JSON.stringify(v2, null, 2) + '\n');
  return dir;
}

test('cli: production refuses update on a clean v2 managed fixture; tree unchanged, exit 1', async (t) => {
  const dir = await seedV2ManagedFixture(await sandbox(t));
  const before = await treeHash(dir);
  const result = await runCli(['containment', 'update', dir, '--json']);
  assert.equal(result.code, 1, result.stdout + result.stderr);
  const decision = JSON.parse(result.stdout);
  assert.equal(decision.decision, 'REFUSE');
  assert.equal(decision.code, 'E_CONTAINMENT_PRODUCTION_REFUSED');
  assert.equal(decision.managed.manifest, 'present-v2');
  assert.equal(await treeHash(dir), before, 'a refused decision writes nothing');
});

test('cli: --test-scope without the opt-in is an explicit error, not a silent downgrade', async (t) => {
  const dir = await seedV2ManagedFixture(await sandbox(t));
  const before = await treeHash(dir);
  const result = await runCli(['containment', 'update', dir, '--json', '--test-scope']);
  assert.equal(result.code, 1, result.stdout + result.stderr);
  assert.match(result.stderr, /VCP_P4_TEST_SCOPE=I_UNDERSTAND_DISPOSABLE_ONLY/);
  assert.equal(await treeHash(dir), before);
});

test('cli: --test-scope with the opt-in allows update on a clean v2 managed fixture; tree unchanged, exit 0', async (t) => {
  const dir = await seedV2ManagedFixture(await sandbox(t));
  const before = await treeHash(dir);
  const result = await runCli(['containment', 'update', dir, '--json', '--test-scope'], TEST_SCOPE_ENV);
  assert.equal(result.code, 0, result.stdout + result.stderr);
  const decision = JSON.parse(result.stdout);
  assert.equal(decision.decision, 'ALLOW_UNDER_TEST_ONLY');
  assert.equal(decision.scope, 'disposable-test');
  assert.equal(decision.managed.manifest, 'present-v2');
  assert.equal(await treeHash(dir), before, 'an allowed decision still writes nothing');
});

test('cli: --test-scope with the opt-in allows init on an empty directory; tree unchanged, exit 0', async (t) => {
  const dir = await sandbox(t);
  const before = await treeHash(dir);
  const result = await runCli(['containment', 'init', dir, '--json', '--test-scope'], TEST_SCOPE_ENV);
  assert.equal(result.code, 0, result.stdout + result.stderr);
  assert.equal(JSON.parse(result.stdout).decision, 'ALLOW_UNDER_TEST_ONLY');
  assert.equal(await treeHash(dir), before);
});

test('cli: test scope still refuses EXPOSED init on the dangerous fixture; tree unchanged, exit 1', async (t) => {
  const dir = await sandbox(t);
  await writeFile(path.join(dir, 'AGENTS.md'), 'PROTECTED ORIGINAL USER BYTES\n');
  await mkdir(path.join(dir, 'update.lock'));
  const before = await treeHash(dir);
  const result = await runCli(['containment', 'init', dir, '--json', '--test-scope'], TEST_SCOPE_ENV);
  assert.equal(result.code, 1, result.stdout + result.stderr);
  const decision = JSON.parse(result.stdout);
  assert.equal(decision.decision, 'REFUSE');
  assert.equal(decision.code, 'E_CONTAINMENT_HAZARD_EXPOSED');
  assert.equal(await treeHash(dir), before);
});

test('cli: directory-shaped .vcp/update.lock refuses update in test scope', async (t) => {
  const dir = await seedV2ManagedFixture(await sandbox(t));
  await mkdir(path.join(dir, '.vcp', 'update.lock'));
  const before = await treeHash(dir);
  const result = await runCli(['containment', 'update', dir, '--json', '--test-scope'], TEST_SCOPE_ENV);
  assert.equal(result.code, 1, result.stdout + result.stderr);
  const decision = JSON.parse(result.stdout);
  assert.equal(decision.decision, 'REFUSE');
  // The directory-shaped .vcp lock also makes inspectProject report
  // ACTIVE_OR_STALE_LOCK, so the reader sets interruptedState and
  // the H3 rule G3 fires before the G4 lock rule. Either refusal is
  // fail-closed for this state.
  assert.ok(['E_CONTAINMENT_INTERRUPTED_STATE', 'E_CONTAINMENT_LOCK_ABNORMAL']
    .includes(decision.code), `unexpected refusal code ${decision.code}`);
  assert.equal(await treeHash(dir), before);
});

test('cli: partial .vcp journal refuses update in test scope (fail-closed)', async (t) => {
  const dir = await seedV2ManagedFixture(await sandbox(t));
  await writeFile(path.join(dir, '.vcp', 'transaction.json'),
    JSON.stringify({ schemaVersion: 2, phase: 'apply', steps: [] }) + '\n');
  const before = await treeHash(dir);
  const result = await runCli(['containment', 'update', dir, '--json', '--test-scope'], TEST_SCOPE_ENV);
  assert.equal(result.code, 1, result.stdout + result.stderr);
  const decision = JSON.parse(result.stdout);
  assert.equal(decision.decision, 'REFUSE');
  // Either the H3 interrupted rule or the G4 journal rule may fire
  // first; both are fail-closed refusals for this state.
  assert.ok(['E_CONTAINMENT_INTERRUPTED_STATE', 'E_CONTAINMENT_JOURNAL_NOT_CLEAN']
    .includes(decision.code), `unexpected refusal code ${decision.code}`);
  assert.equal(await treeHash(dir), before);
});

test('cli: unknown operation errors; mutating flags are rejected', async (t) => {
  const dir = await sandbox(t);
  const unknown = await runCli(['containment', 'explode', dir]);
  assert.equal(unknown.code, 1);
  assert.match(unknown.stderr, /Containment requires an operation/);
  const missing = await runCli(['containment', dir]);
  assert.equal(missing.code, 1);
  assert.match(missing.stderr, /Containment requires an operation/);
  const mutating = await runCli(['containment', 'update', dir, '--force']);
  assert.equal(mutating.code, 1);
  assert.match(mutating.stderr, /does not accept mutating\/planning flags/);
});
