import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assessD01EnforcedIsolation } from '../lib/legacy-writer-fence-contract.mjs';

const operations=[
  'init-present-manifest','init-missing-manifest','init-corrupt-manifest',
  'update','manage','rollback','rollback-stale-backup',
  'old-new-race','post-backup-user-edits'
];
function candidate() {
  const oldCliArchiveSha256='a'.repeat(64);
  const native=platform=>({
    nativePlatform:true,filesystem:platform==='win32'?'NTFS':'ext4',
    sameSecurityScope:true,
    mandatoryPolicyType:platform==='win32'?
      'WDAC_SIGNER_ENFORCEMENT':'SELINUX_MANDATORY_CONFINEMENT',
    policyArtifactSha256:'c'.repeat(64),
    policyEffectiveForPrivilegedOldBinary:true,
    observedDenied:Object.fromEntries(operations.map(name=>[name,true])),
    denialReceipts:Object.fromEntries(operations.map(name=>[name,{
      exitCode:5,denialOrigin:'OS_MANDATORY_POLICY',
      beforeTreeSha256:'b'.repeat(64),afterTreeSha256:'b'.repeat(64),
      rawLogSha256:'d'.repeat(64),oldCliArchiveSha256,
      independentReviewerId:'native-testing-agent'
    }])),
    allUserBytesUnchanged:true,outsiderBytesUnchanged:true
  });
  return {
    securityBoundary:'OS_ENFORCED_SEPARATE_PRINCIPALS',
    legacyPrincipal:'legacy-uid-or-sid',newWriterPrincipal:'isolated-uid-or-sid',
    oldCliArchiveAuthenticated:true,oldCliArchiveSha256,
    selectedRootIdentity:'root-inode-or-file-id',
    sameRootAfterTransition:true,
    platformProof:{linux:native('linux'),win32:native('win32')},
    denyLegacyExecutableUnderWriterPrincipal:true,
    independentRawReceiptsAvailable:true
  };
}
test('D-01 never authorizes managed writes even with all declared observations',()=>{
  const verdict=assessD01EnforcedIsolation(candidate());
  assert.equal(verdict.status,'CANDIDATE_REQUIRES_INDEPENDENT_D01_APPROVAL');
  assert.equal(verdict.gate,'NO_GO');
  assert.equal(verdict.mutationAuthorized,false);
  assert.equal(verdict.approved,false);
});
test('published 0.9.3 cannot share new-writer security identity',()=>{
  const proof=candidate();
  proof.legacyPrincipal=proof.newWriterPrincipal;
  const result=assessD01EnforcedIsolation(proof);
  assert.equal(result.status,'NO_GO');
  assert.ok(result.defects.includes('SHARED_OR_UNKNOWN_WRITER_IDENTITY'));
});
test('missing-manifest old init and old new races are mandatory on both hosts',()=>{
  for(const platform of ['linux','win32']) {
    for(const operation of ['init-missing-manifest','old-new-race',
      'rollback','post-backup-user-edits']) {
      const proof=candidate();
      delete proof.platformProof[platform].observedDenied[operation];
      const verdict=assessD01EnforcedIsolation(proof);
      assert.equal(verdict.status,'NO_GO');
      assert.ok(verdict.defects.some(x=>x.includes(operation)));
    }
  }
});
test('isolation not effective if published old binary can run privileged',()=>{
  const proof=candidate();proof.denyLegacyExecutableUnderWriterPrincipal=false;
  assert.equal(assessD01EnforcedIsolation(proof).status,'NO_GO');
});
test('D-01 must reject CLI-level exit failure pretending to be OS denial',()=>{
  const proof=candidate();
  proof.platformProof.win32.denialReceipts['init-missing-manifest'].denialOrigin=
    'CLI_REFUSED_NOT_OS';
  const verdict=assessD01EnforcedIsolation(proof);
  assert.equal(verdict.status,'NO_GO');
  assert.ok(verdict.defects.some(x=>x.includes('init-missing-manifest')));
});
test('D-01 must reject altered user-tree hashes and unsigned policy scope',()=>{
  const proof=candidate();
  proof.platformProof.linux.denialReceipts.rollback.afterTreeSha256='e'.repeat(64);
  proof.platformProof.win32.mandatoryPolicyType='NONE';
  const verdict=assessD01EnforcedIsolation(proof);
  assert.equal(verdict.status,'NO_GO');
  assert.ok(verdict.defects.includes('MANDATORY_POLICY_UNPROVEN_WIN32'));
  assert.ok(verdict.defects.some(x=>x.includes('rollback')));
});

test('missing independent native evidence never looks approved',()=>{
  for(const mutate of [
    x=>{x.platformProof.win32.nativePlatform=false;},
    x=>{x.platformProof.linux.allUserBytesUnchanged=false;},
    x=>{x.oldCliArchiveAuthenticated=false;},
    x=>{x.independentRawReceiptsAvailable=false;}
  ]) {
    const proof=candidate();mutate(proof);
    assert.equal(assessD01EnforcedIsolation(proof).status,'NO_GO');
  }
});
