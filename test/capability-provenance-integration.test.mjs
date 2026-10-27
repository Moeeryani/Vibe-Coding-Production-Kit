// Batch B: capability-application-provenance integrated into capability-plan.
// The plan no longer says provenance is NOT_AVAILABLE: it carries a preview
// proving nothing is recorded, nothing applied, and no authority granted.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import os from 'node:os';
import path from 'node:path';
import { planCapabilityApplication, CAPABILITY_LIFECYCLE_STATES } from '../lib/capability-application-plan.mjs';
import { previewCapabilityProvenance } from '../lib/capability-application-provenance.mjs';

const execFileAsync = promisify(execFile);
const digest = 'sha256:' + 'a'.repeat(64);
const discovery = (id = 'language.rust') => ({ status: 'INSPECTED', capabilities: [{ id, evidence: ['Cargo.toml'] }], issues: [] });
const selected = (id = 'language.rust') => ({ status: 'INSPECTED', profiles: [{
  id: 'profile.rust', status: 'MATCHED_UNTRUSTED', digest, selected: true,
  digestVerified: true, grantVerified: true, candidateCapabilities: [id] }] });

test('plan carries a provenance preview, not a NOT_AVAILABLE placeholder', () => {
  const p = planCapabilityApplication({ discovery: discovery(), selectedProfiles: selected() });
  assert.equal(p.recordedApplicationProvenance, 'NOT_RECORDED');
  assert.equal(p.applicationProvenance.schemaVersion, 1);
  assert.equal(p.applicationProvenance.readOnly, true);
  assert.equal(p.applicationProvenance.proposalDigest, p.evidenceDigest);
  assert.equal(p.applicationProvenance.proposalStatus, 'REVIEW_REQUIRED');
  assert.deepEqual(p.applicationProvenance.proposedCapabilityIds, ['language.rust']);
  assert.equal(p.applicationProvenance.persistedApplication, false);
  assert.deepEqual(p.applicationProvenance.appliedCapabilities, []);
  assert.equal(p.applicationProvenance.ownerApproval, 'NOT_ESTABLISHED');
  assert.equal(p.applicationProvenance.commandsAuthorized, false);
  assert.equal(p.applicationProvenance.executionAuthorized, false);
  assert.equal(p.applicationProvenance.D01, 'DEFERRED');
  assert.equal(p.applicationProvenance.GFENCE, 'NO_GO');
  assert.equal(p.applicationProvenance.manifestSchema, null);
  assert.equal(p.applicationProvenance.legacyInstalledStack, null);
});

test('digest-verified selection still yields PROPOSED, never APPLIED', () => {
  const p = planCapabilityApplication({ discovery: discovery(), selectedProfiles: selected('platform.desktop') });
  assert.equal(p.capabilities.length, 2);
  for (const c of p.capabilities) {
    assert.equal(c.status, 'PROPOSED_NOT_APPLIED');
    assert.equal(c.commandAuthority, 'NOT_GRANTED');
    assert.notEqual(c.status, 'APPLIED');
  }
  assert.equal(p.applicationProvenance.proposalStatus, 'REVIEW_REQUIRED');
  assert.deepEqual(p.applicationProvenance.proposedCapabilityIds, ['language.rust', 'platform.desktop']);
  // The lifecycle vocabulary names APPLIED only as not representable here.
  assert.match(CAPABILITY_LIFECYCLE_STATES.APPLIED, /NOT REPRESENTABLE/);
  assert.equal(JSON.stringify(p).includes('"APPLIED"'), false);
});

test('partial evidence blocks the proposal and the preview says so', () => {
  const p = planCapabilityApplication({ discovery: { status: 'PARTIAL', capabilities: [], issues: [{ path: 'go.mod', reason: 'LINK' }] } });
  assert.equal(p.status, 'BLOCKED_PARTIAL_EVIDENCE');
  assert.equal(p.applicationProvenance.proposalStatus, 'BLOCKED_PARTIAL_EVIDENCE');
  assert.deepEqual(p.applicationProvenance.proposedCapabilityIds, []);
});

test('v1 and v2 installed manifests are reported, never extended', () => {
  for (const schemaVersion of [1, 2]) {
    const manifest = { schemaVersion, install: { stack: 'node' } };
    const p = planCapabilityApplication({ discovery: discovery(), manifest });
    assert.equal(p.applicationProvenance.manifestSchema, schemaVersion);
    assert.equal(p.applicationProvenance.legacyInstalledStack, 'node');
    assert.equal(p.applicationProvenance.persistedApplication, false);
  }
});

test('historical manifests carrying capability fields fail closed', () => {
  const bad = [
    { schemaVersion: 2, install: { stack: 'node' }, appliedCapabilities: [] },
    { schemaVersion: 2, install: { stack: 'node' }, capabilityProvenance: {} },
    { schemaVersion: 1, install: { stack: 'node', appliedCapabilities: [] } },
    { schemaVersion: 3, install: { stack: 'node' } },
  ];
  for (const manifest of bad) {
    assert.throws(
      () => planCapabilityApplication({ discovery: discovery(), manifest }),
      /E_APPLICATION_(MANIFEST_INVALID|UNAUTHORIZED_MANIFEST_FIELD)/);
  }
});

test('a claimed approval is refused: the approval contract is undefined', () => {
  const p = planCapabilityApplication({ discovery: discovery() });
  assert.throws(
    () => previewCapabilityProvenance({ applicationPlan: p, claimedApproval: { decision: 'accepted' } }),
    /E_APPLICATION_APPROVAL_CONTRACT_UNDEFINED/);
});

test('CLI capability-plan emits the preview and tolerates a corrupt manifest', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'vcp-cap-plan-'));
  try {
    await mkdir(path.join(dir, '.vcp'), { recursive: true });
    await writeFile(path.join(dir, '.vcp', 'manifest.json'), JSON.stringify({ schemaVersion: 2, install: { stack: 'node' } }));
    const bin = path.resolve('bin/vibe-coding-production.mjs');
    const { stdout } = await execFileAsync(process.execPath, [bin, 'capability-plan', dir, '--json']);
    const report = JSON.parse(stdout);
    assert.equal(report.recordedApplicationProvenance, 'NOT_RECORDED');
    assert.equal(report.applicationProvenance.manifestSchema, 2);
    assert.equal(report.applicationProvenance.legacyInstalledStack, 'node');
    assert.equal(report.applicationProvenance.persistedApplication, false);
    // Corrupt manifest: same command still succeeds, with no manifest context.
    await writeFile(path.join(dir, '.vcp', 'manifest.json'), '{not json');
    const again = JSON.parse((await execFileAsync(process.execPath, [bin, 'capability-plan', dir, '--json'])).stdout);
    assert.equal(again.applicationProvenance.manifestSchema, null);
    assert.equal(again.applicationProvenance.persistedApplication, false);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
