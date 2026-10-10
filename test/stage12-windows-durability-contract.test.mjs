import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { assessWindowsDurabilityEvidence } from '../lib/windows-durability-contract.mjs';
import { lifecycleDurabilityCapability } from '../lib/file-durability.mjs';

const operations=['create','file-flush','rename-write-through','directory-sync',
  'owned-unlink','owned-rmdir','journal-replay','lock-release'];
function completeDeclaredReport() {
  return {platform:'win32',filesystem:'NTFS',nativeWindows:true,
    disposableFixture:true,publishedImplementationHashVerified:true,
    fileFlushReturned:true,moveWriteThroughReturned:true,
    parentMetadataPersisted:true,realPowerInterruptionReplayed:true,
    userBytesUntouched:true,foreignBytesUntouched:true,
    scenarios:Object.fromEntries(operations.map(x=>[x,true]))};
}
test('NTFS evidence never bypasses known unsupported production fsync',()=>{
  const report=assessWindowsDurabilityEvidence(completeDeclaredReport());
  assert.equal(report.status,'NATIVE_PROVIDER_REVIEW_CANDIDATE');
  assert.equal(report.mutationAuthorized,false);
  assert.equal(report.directoryDurabilityProven,false);
  assert.equal(lifecycleDurabilityCapability('win32').supported,false);
});
test('missing true power-loss replay or a native cleanup phase remains NO-GO',()=>{
  for(const field of ['realPowerInterruptionReplayed','parentMetadataPersisted',
    'fileFlushReturned','moveWriteThroughReturned','publishedImplementationHashVerified',
    'foreignBytesUntouched']) {
    const evidence=completeDeclaredReport();evidence[field]=false;
    assert.equal(assessWindowsDurabilityEvidence(evidence).status,'NO_GO');
  }
  for(const operation of operations) {
    const evidence=completeDeclaredReport();delete evidence.scenarios[operation];
    assert.equal(assessWindowsDurabilityEvidence(evidence).status,'NO_GO');
  }
});
test('native probe is diagnostic and not a production durability authority',async()=>{
  const source=await readFile(new URL(
    '../scripts/native/stage12-windows-namespace-probe.cpp',import.meta.url),'utf8');
  assert.match(source,/MOVEFILE_WRITE_THROUGH/);
  assert.match(source,/FlushFileBuffers/);
  assert.match(source,/isDurabilityAttestation/);
  assert.match(source,/requiresIndependentCrashAndPowerLossProof/);
});
