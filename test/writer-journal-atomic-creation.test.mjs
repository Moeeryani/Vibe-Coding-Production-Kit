// P5-01 — PH-06 deterministic adversarial tests.
//
// The P4 PH-06 test (two concurrent creators, exactly one wins) passed
// by timing luck: both writers could pass the previousHash re-check
// before either rename landed, and the commit rename had REPLACE
// semantics, so the second rename silently replaced the first. P5-01
// makes creation kernel-exclusive: the anchored path commits with
// rename-noreplace (renameat2 RENAME_NOREPLACE) and the legacy path
// commits with link() (atomic, EEXIST). Exactly one creator succeeds;
// every loser gets a deterministic refusal.
//
// Controlled lane only: disposable fixtures, gate-bypassed mutations
// through the controlled lane. See B4-B5-CONTROLLED-LANE-SECURITY-REVIEW.md.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { lstat, link, mkdir, readFile, readdir, rename, rm, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { mutationTest } from './helpers/layer-assertion.mjs';
import {
  createControlledFixture, teardownControlledFixture,
} from './helpers/controlled-writer-fixture.mjs';
import {
  writeVersionedJournal, inspectVersionedJournal,
  classifyJournalCrashState, readVersionedJournalDigest,
} from '../lib/versioned-journal.mjs';
import { describeStage13Transaction } from '../lib/stage13-transaction.mjs';
import { describeVersionedTransaction } from '../lib/managed-recovery-v2.mjs';
import { secureWriterProviderStatus } from '../lib/secure-fs-provider.mjs';

const OPS = ['journal-write', 'journal-clear'];
const sha256 = (b) => createHash('sha256').update(b).digest('hex');
const desc = (id, phase = 'prepared') => ({
  formatVersion: 2, transactionSchemaVersion: 2, id, operationId: id,
  backupId: id, operation: 'update', phase,
  minimumReaderVersion: '0.9.4', startedAt: new Date().toISOString(),
  plannedManifestHash: 'b'.repeat(64), createdFiles: [],
});
async function withVcp(f) {
  await mkdir(path.join(f.root, '.vcp'), { recursive: true, mode: 0o700 });
}
const REFUSAL_CODES = new Set(['E_JOURNAL_ALREADY_EXISTS', 'E_JOURNAL_CHANGED']);

mutationTest('P5-01-A — 8 parallel creators, 10 rounds: exactly one wins per round', async () => {
  for (let round = 0; round < 10; round++) {
    const f = await createControlledFixture({ allowedOperations: OPS });
    try {
      await withVcp(f);
      const writers = Array.from({ length: 8 }, (_, i) =>
        writeVersionedJournal(f.root, desc(`p5-01-a-r${round}-w${i}`),
          { previousHash: null, readerVersion: '0.9.4' }, f.capability));
      const results = await Promise.allSettled(writers);
      const ok = results.filter((r) => r.status === 'fulfilled');
      const refused = results.filter((r) => r.status === 'rejected');
      assert.equal(ok.length, 1,
        `round ${round}: exactly one concurrent creation must succeed (got ${ok.length})`);
      assert.equal(refused.length, 7, `round ${round}: seven losers must refuse`);
      for (const r of refused) {
        assert.ok(REFUSAL_CODES.has(r.reason?.code),
          `round ${round}: loser refusal must be deterministic (got ${r.reason?.code})`);
      }
      // The winning journal is intact and its provenance matches the
      // mode: anchored (helper present) records provenance; legacy
      // mode reports 'unrecorded' by design. R-INT-14: this test
      // over-asserted 'recorded-matching' in legacy mode (the
      // validator's unbuilt-tree run failed 14/15 on this assertion
      // alone; product behavior held).
      const inspected = await inspectVersionedJournal(f.root);
      const st = secureWriterProviderStatus();
      const anchored = st.provider === 'linux-native' && st.helper.present;
      assert.equal(inspected.provenance, anchored ? 'recorded-matching' : 'unrecorded',
        `round ${round}: winner provenance must be ${anchored ? 'recorded-matching' : 'unrecorded'}`);
      assert.equal(inspected.sha256, ok[0].value.sha256,
        `round ${round}: inspected digest must match the winner return`);
      // No staging temp survives any writer (winner renamed, losers deleted).
      const names = await readdir(path.join(f.root, '.vcp'));
      assert.deepEqual(names.filter((n) => /^transaction-[0-9a-f]+\.tmp$/.test(n)), [],
        `round ${round}: no staging temp may survive`);
    } finally { await teardownControlledFixture(f); }
  }
});

mutationTest('P5-01-B — creation against an existing journal refuses, bytes unchanged', async () => {
  const f = await createControlledFixture({ allowedOperations: OPS });
  try {
    await withVcp(f);
    await writeVersionedJournal(f.root, desc('p5-01-b-first'),
      { previousHash: null, readerVersion: '0.9.4' }, f.capability);
    const before = await readFile(path.join(f.root, '.vcp', 'transaction.json'), 'utf8');
    await assert.rejects(
      writeVersionedJournal(f.root, desc('p5-01-b-second'),
        { previousHash: null, readerVersion: '0.9.4' }, f.capability),
      (e) => e.code === 'E_JOURNAL_CHANGED');
    const after = await readFile(path.join(f.root, '.vcp', 'transaction.json'), 'utf8');
    assert.equal(after, before, 'an already-owned journal must never be silently replaced');
  } finally { await teardownControlledFixture(f); }
});

mutationTest('P5-01-C — link() primitive: exactly one of two concurrent links succeeds', async () => {
  const f = await createControlledFixture({ allowedOperations: OPS });
  try {
    await withVcp(f);
    const a = path.join(f.root, '.vcp', 'link-a.tmp');
    const b = path.join(f.root, '.vcp', 'link-b.tmp');
    const dest = path.join(f.root, '.vcp', 'transaction.json');
    await writeFile(a, 'A\n');
    await writeFile(b, 'B\n');
    const results = await Promise.allSettled([link(a, dest), link(b, dest)]);
    const ok = results.filter((r) => r.status === 'fulfilled');
    const refused = results.filter((r) => r.status === 'rejected');
    assert.equal(ok.length, 1, 'exactly one concurrent link must succeed');
    assert.equal(refused.length, 1, 'the other link must refuse');
    assert.equal(refused[0].reason?.code, 'EEXIST', 'the loser must see EEXIST');
    const content = await readFile(dest, 'utf8');
    assert.ok(content === 'A\n' || content === 'B\n', 'destination holds exactly one writer bytes');
  } finally { await teardownControlledFixture(f); }
});

mutationTest('P5-01-D — creation against a symlinked journal path refuses, target untouched', async () => {
  const f = await createControlledFixture({ allowedOperations: OPS });
  try {
    await withVcp(f);
    const target = path.join(f.root, 'outside-target.json');
    await writeFile(target, '{"target":"bytes"}\n');
    await symlink(target, path.join(f.root, '.vcp', 'transaction.json'));
    await assert.rejects(
      writeVersionedJournal(f.root, desc('p5-01-d'),
        { previousHash: null, readerVersion: '0.9.4' }, f.capability),
      // The safe-path layer refuses to resolve a symlinked managed-state
      // path before any commit is attempted (LINK_REFUSED) — a
      // fail-closed refusal, and the target is never touched.
      (e) => /LINK_REFUSED/.test(e.message));
    assert.equal(await readFile(target, 'utf8'), '{"target":"bytes"}\n',
      'the symlink target must be untouched');
    const st = await lstat(path.join(f.root, '.vcp', 'transaction.json'));
    assert.ok(st.isSymbolicLink(), 'the symlink itself must survive');
  } finally { await teardownControlledFixture(f); }
});

mutationTest('P5-01-E — creation against a malformed journal refuses, bytes unchanged', async () => {
  const f = await createControlledFixture({ allowedOperations: OPS });
  try {
    await withVcp(f);
    await writeFile(path.join(f.root, '.vcp', 'transaction.json'), '{torn json\n');
    // The entry previousHash check fires before the journal bytes are
    // parsed: a journal exists but its digest is not null, so creation
    // refuses E_JOURNAL_CHANGED. (E_JOURNAL_OLD_FORMAT fires only when
    // the caller passes the malformed journal's own hash as
    // previousHash and the parse then fails.)
    await assert.rejects(
      writeVersionedJournal(f.root, desc('p5-01-e'),
        { previousHash: null, readerVersion: '0.9.4' }, f.capability),
      (e) => e.code === 'E_JOURNAL_CHANGED');
    assert.equal(await readFile(path.join(f.root, '.vcp', 'transaction.json'), 'utf8'),
      '{torn json\n', 'a malformed journal must never be overwritten');
  } finally { await teardownControlledFixture(f); }
});

mutationTest('P5-01-F — concurrent transitions: final journal always a valid version', async () => {
  // DOCUMENTED RESIDUAL (design.md §6.1 item 3): POSIX has no atomic
  // compare-and-swap on a pathname, so lock-free transitions keep a
  // micro-window in which two writers can both report success. This
  // test asserts what IS guaranteed — the final journal is always a
  // complete, valid version, never torn — and does NOT assert
  // exactly-one-winner for transitions. Creation (P5-01-A) is the
  // closed race.
  for (let round = 0; round < 5; round++) {
    const f = await createControlledFixture({ allowedOperations: OPS });
    try {
      await withVcp(f);
      await writeVersionedJournal(f.root, desc('p5-01-f'),
        { previousHash: null, readerVersion: '0.9.4' }, f.capability);
      const h = await readVersionedJournalDigest(f.root);
      // One shared transition descriptor, derived from the journal
      // actually committed: the transition rule requires startedAt /
      // plannedManifestHash / createdFiles to be unchanged across
      // transitions, so concurrent transitions of one journal
      // necessarily carry identical bytes. The race is only about
      // whose rename lands last — the bytes are the same either way,
      // which is exactly why the final journal can never be torn.
      const prepared = JSON.parse(await readFile(
        path.join(f.root, '.vcp', 'transaction.json'), 'utf8'));
      const transition = { ...prepared, phase: 'recovering' };
      const writers = Array.from({ length: 4 }, () =>
        writeVersionedJournal(f.root, transition,
          { previousHash: h, readerVersion: '0.9.4' }, f.capability));
      const results = await Promise.allSettled(writers);
      const ok = results.filter((r) => r.status === 'fulfilled');
      assert.ok(ok.length >= 1, `round ${round}: at least one transition must succeed`);
      for (const r of results.filter((x) => x.status === 'rejected')) {
        // E_JOURNAL_RACE is a known fail-closed refusal: a concurrent
        // rename landed mid-read and the read refused rather than
        // trusting torn bytes. Pre-existing legacy-mode flakiness
        // (proven on the unmodified b4d7bf4 line: 1/10 runs fail with
        // exactly this code, and the fixes line fails the same way at
        // the same rate); the anchored path does not hit it.
        assert.ok(['E_JOURNAL_CHANGED', 'E_JOURNAL_WRITE_NOT_DURABLE',
          'E_JOURNAL_RACE'].includes(r.reason?.code),
          `round ${round}: transition loser code must be a known refusal (got ${r.reason?.code})`);
      }
      const state = await classifyJournalCrashState(f.root);
      assert.equal(state.state, 'complete', `round ${round}: final journal must be complete`);
      assert.equal(state.phase, 'recovering', `round ${round}: final phase must be recovering`);
      assert.equal(state.formatVersion, 2);
    } finally { await teardownControlledFixture(f); }
  }
});

mutationTest('P5-01-H — root replacement mid-transition: a false failure is reported accurately (R-INT-8)', async () => {
  // Adapted from the independent validator's T3 probe. The honest
  // property: the journal is always a valid version (never torn), and
  // when the rename lands in the detached tree while the caller is
  // told the write failed, the refusal MUST name the namespace
  // change (E_JOURNAL_COMMIT_NAMESPACE_CHANGED) — never a generic
  // helper failure. The refusal code is asserted only when the
  // refused-but-mutated case actually occurs in a run (timing
  // decides whether the swap lands in the window); the never-torn
  // property is asserted unconditionally.
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const outcomes = { refusedMutated: 0, refusedNamespaceChanged: 0, succeeded: 0, torn: 0 };
  for (const delay of [5, 10, 20, 35, 50]) {
    for (let rep = 0; rep < 4; rep++) {
      const f = await createControlledFixture({ allowedOperations: OPS });
      const moved = f.root + '-moved';
      let swapped = false;
      try {
        await withVcp(f);
        await writeVersionedJournal(f.root, desc('p5-01-h'),
          { previousHash: null, readerVersion: '0.9.4' }, f.capability);
        const h = await readVersionedJournalDigest(f.root);
        const before = await readFile(path.join(f.root, '.vcp', 'transaction.json'), 'utf8');
        const prepared = JSON.parse(before);
        const pending = writeVersionedJournal(f.root, { ...prepared, phase: 'applying' },
          { previousHash: h, readerVersion: '0.9.4' }, f.capability)
          .then(() => ({ ok: true })).catch((e) => ({ ok: false, code: e.code }));
        await sleep(delay);
        await rename(f.root, moved);
        swapped = true;
        await mkdir(f.root, { mode: 0o700 });
        await mkdir(path.join(f.root, '.vcp'), { mode: 0o700 });
        await writeFile(path.join(f.root, '.vcp', 'transaction.json'),
          JSON.stringify(desc('p5-01-h-copy')) + '\n');
        const r = await pending;
        const movedBytes = await readFile(path.join(moved, '.vcp', 'transaction.json'), 'utf8');
        const movedPhase = JSON.parse(movedBytes).phase;
        const mutated = movedBytes !== before;
        const state = await classifyJournalCrashState(moved);
        if (!['complete', 'absent', 'staged-interrupted'].includes(state.state)) outcomes.torn++;
        if (r.ok) {
          outcomes.succeeded++;
          if (movedPhase !== 'applying') outcomes.torn++;
        } else if (mutated) {
          outcomes.refusedMutated++;
          assert.equal(r.code, 'E_JOURNAL_COMMIT_NAMESPACE_CHANGED',
            `delay ${delay} rep ${rep}: refused-but-mutated must report E_JOURNAL_COMMIT_NAMESPACE_CHANGED (got ${r.code})`);
          outcomes.refusedNamespaceChanged++;
        }
      } finally {
        // Restore the original root even if an assertion failed, so a
        // teardown identity error never masks the real failure.
        if (swapped) {
          await rm(f.root, { recursive: true, force: true }).catch(() => {});
          await rename(moved, f.root).catch(() => {});
        }
        await teardownControlledFixture(f);
      }
    }
  }
  assert.equal(outcomes.torn, 0, `journal must never tear under root replacement (torn=${outcomes.torn})`);
});

test('P5-01-G — crash-state classifier matrix', async () => {
  const f = await createControlledFixture({ allowedOperations: OPS });
  try {
    // G1: no .vcp at all.
    let state = await classifyJournalCrashState(f.root);
    assert.equal(state.state, 'absent');
    assert.equal(state.journalPresent, false);
    await withVcp(f);
    // G2: empty .vcp.
    state = await classifyJournalCrashState(f.root);
    assert.equal(state.state, 'absent');
    // G3: valid v2 journal.
    await writeVersionedJournal(f.root, desc('p5-01-g3'),
      { previousHash: null, readerVersion: '0.9.4' }, f.capability);
    state = await classifyJournalCrashState(f.root);
    assert.equal(state.state, 'complete');
    assert.equal(state.phase, 'prepared');
    assert.equal(state.formatVersion, 2);
    assert.equal(state.journalSha256, await readVersionedJournalDigest(f.root));
    assert.equal(state.journalPresent, true);
    // G4: valid Stage 13 committed transaction (same path, other schema).
    const st = await lstat(f.root, { bigint: true });
    const tx = describeStage13Transaction({
      id: 'adopt-20261031-01',
      rootIdentity: sha256(Buffer.from(f.root + '|' + st.dev + '|' + st.ino)),
      consentFingerprint: 'b'.repeat(64),
      manifestSha256: 'c'.repeat(64), minimumReaderVersion: '0.9.4',
      createdAt: '2026-10-31T00:00:00.000Z', phase: 'committed',
      items: [{ path: 'OTHER.md', kind: 'whole-file', oldSha256: null,
        stagedDev: '7', stagedIno: '9', newSha256: 'd'.repeat(64),
        baselineSha256: 'd'.repeat(64) }],
      createdDirectories: [],
    });
    await writeFile(path.join(f.root, '.vcp', 'transaction.json'),
      JSON.stringify(tx, null, 2) + '\n');
    state = await classifyJournalCrashState(f.root);
    assert.equal(state.state, 'complete');
    assert.equal(state.phase, 'committed');
    assert.equal(state.formatVersion, 3);
    // G5: staging temp without a journal.
    const { rm } = await import('node:fs/promises');
    await rm(path.join(f.root, '.vcp', 'transaction.json'));
    await writeFile(path.join(f.root, '.vcp', 'transaction-abcdef0123456789.tmp'), 'staged\n');
    state = await classifyJournalCrashState(f.root);
    assert.equal(state.state, 'staged-interrupted');
    assert.deepEqual(state.stagingTemps, ['transaction-abcdef0123456789.tmp']);
    // G6: malformed JSON journal.
    await rm(path.join(f.root, '.vcp', 'transaction-abcdef0123456789.tmp'));
    await writeFile(path.join(f.root, '.vcp', 'transaction.json'), '{torn\n');
    state = await classifyJournalCrashState(f.root);
    assert.equal(state.state, 'partial-malformed');
    // G7: legacy v1 journal (no formatVersion).
    await writeFile(path.join(f.root, '.vcp', 'transaction.json'),
      JSON.stringify({ id: 'legacy-1', phase: 'committed', backupId: 'legacy-1' }) + '\n');
    state = await classifyJournalCrashState(f.root);
    assert.equal(state.state, 'legacy');
    // G8: symlinked journal.
    const target = path.join(f.root, 'outside.json');
    await writeFile(target, '{}\n');
    await rm(path.join(f.root, '.vcp', 'transaction.json'));
    await symlink(target, path.join(f.root, '.vcp', 'transaction.json'));
    state = await classifyJournalCrashState(f.root);
    assert.equal(state.state, 'symlinked');
    assert.equal(await readFile(target, 'utf8'), '{}\n', 'classification must not follow the link');
    // G9: journal is a directory.
    await rm(path.join(f.root, '.vcp', 'transaction.json'));
    await mkdir(path.join(f.root, '.vcp', 'transaction.json'));
    state = await classifyJournalCrashState(f.root);
    assert.equal(state.state, 'partial-malformed');
    // G10: cleanup phase with non-empty root (terminal preconditions unmet).
    await rm(path.join(f.root, '.vcp', 'transaction.json'), { recursive: true });
    await writeFile(path.join(f.root, 'AGENTS.md'), 'user bytes\n');
    const cleanup = describeVersionedTransaction({
      operationId: 'p5-01-g10', backupId: 'p5-01-g10', operation: 'init',
      phase: 'cleanup', minimumReaderVersion: '0.9.4',
      startedAt: new Date().toISOString(),
      createdFiles: [{ path: '.vcp/manifest.json', hash: 'a'.repeat(64) },
        { path: '.vcp/.gitignore', hash: 'b'.repeat(64) }],
      cleanupBackupHash: 'c'.repeat(64),
    });
    await writeFile(path.join(f.root, '.vcp', 'transaction.json'),
      JSON.stringify(cleanup, null, 2) + '\n');
    state = await classifyJournalCrashState(f.root);
    assert.equal(state.state, 'cleanup-interrupted');
    assert.equal(state.phase, 'cleanup');
    // G11: oversize journal (beyond the 512 KiB read bound) is unreadable, not complete.
    await writeFile(path.join(f.root, '.vcp', 'transaction.json'),
      '{"formatVersion":2,' + '"x":"' + 'y'.repeat(600 * 1024) + '"}');
    state = await classifyJournalCrashState(f.root);
    assert.equal(state.state, 'unreadable');
  } finally { await teardownControlledFixture(f); }
});
