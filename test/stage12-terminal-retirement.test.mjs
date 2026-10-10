import { test } from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {
  evaluateTerminalRetirement,retireGreenfieldControlDirectory
} from '../lib/terminal-retirement-v2.mjs';
import {planNoReplaceMove,moveDirectoryNoReplace} from '../lib/native-no-replace.mjs';

const H='a'.repeat(64);
function state() {
  return {
    priorClassification:'TERMINAL_CLEANUP_CANDIDATE',
    rootNames:['.vcp'],
    stateNames:['transaction.json','update.lock'],
    journalHash:H,expectedJournalHash:H,
    lockTokenMatches:true,writerBoundaryAccepted:true
  };
}
test('terminal retirement never asserts D-01 or native durability',()=>{
  const plan=evaluateTerminalRetirement(state());
  assert.equal(plan.classification,'NATIVE_RENAME_CANDIDATE');
  assert.equal(plan.authorized,false);
  assert.equal(plan.gate,'NO_GO');
});
test('terminal retirement rejects foreign data, missing journal or foreign lock',()=>{
  for(const mutate of [
    x=>x.rootNames.push('user.md'),
    x=>x.stateNames.push('backups'),
    x=>x.stateNames.splice(0,1),
    x=>x.lockTokenMatches=false,
    x=>x.expectedJournalHash='b'.repeat(64),
    x=>x.writerBoundaryAccepted=false,
    x=>x.priorClassification='BLOCKED'
  ]) {
    const proof=state();mutate(proof);
    assert.equal(evaluateTerminalRetirement(proof).classification,'BLOCKED');
  }
});
test('native no-replace boundary refuses unsafe sibling scope and never falls back',async()=>{
  const root='/disposable-project';
  const source='/disposable-project/.vcp';
  const destination='/.disposable-project.vcp-recovery-retired-backup-'+('a'.repeat(40));
  const plan=planNoReplaceMove({root,source,destination,platform:'linux'});
  assert.equal(plan.operation,'ATOMIC_DIRECTORY_RENAME_NOREPLACE');
  assert.equal(plan.authorized,false);
  assert.equal(plan.siblingWriteScopeApprovalRequired,true);
  for(const wrong of [
    {root,source:'/other/.vcp',destination},
    {root,source,destination:'/disposable-project/inside-root'},
    {root,source,destination:'/somewhere/unrelated'}
  ])assert.throws(()=>planNoReplaceMove(wrong),{code:'E_NAMESPACE_SCOPE'});
  await assert.rejects(()=>moveDirectoryNoReplace({
    root,source,destination,platform:'linux'
  }),{code:'E_NATIVE_NOREPLACE_UNAVAILABLE'});
});

test('Linux native no-replace probe is disposable and not an attestation',async()=>{
  const source=await readFile(new URL(
    '../scripts/native/stage12-linux-noreplace-probe.cpp',import.meta.url),'utf8');
  assert.match(source,/SYS_renameat2/);
  assert.match(source,/RENAME_NOREPLACE/);
  assert.match(source,/EEXIST/);
  assert.match(source,/VCP-STAGE12-DISPOSABLE-ONLY\.marker/);
  assert.match(source,/isDurabilityAttestation/);
  assert.match(source,/requiresIndependentCrashAndPowerLossProof/);
});
test('terminal candidate refuses mutation before touching unknown root',async()=>{
  await assert.rejects(()=>retireGreenfieldControlDirectory({
    rootPath:'nonexistent-root',expectedJournalHash:H,ownedLock:null
  }),{code:'E_G_FENCE_NO_GO'});
});
