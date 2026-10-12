import {test} from 'node:test';
import assert from 'node:assert/strict';
import {assessWindowsD01FixturePrincipalMatrix}
  from '../lib/windows-d01-fixture-matrix.mjs';

const root='1'.repeat(24);
const withId='2'.repeat(24);
const withoutId='3'.repeat(24);
const oldSid='S-1-5-21-100-200-300-1001';
const writerSid='S-1-5-21-100-200-300-1002';
const fixture={
  kind:'D01_WINDOWS_DISPOSABLE_FIXTURE_V2',status:'NO_GO',
  root:'C:\\ProgramData\\vcp-win-d01-isolation-'+'a'.repeat(32),
  rootIdentity:root,
  withManifestIdentity:withId,withoutManifestIdentity:withoutId,
  oldSid,writerSid,location:'ProgramData',ntfs:true,
  manifestVariants:['with-manifest','without-manifest'],
  filesCreatedOnly:true,selectedProjectTouched:false,
  actualOldTokenTested:false,parentRenameDenialProven:false,
  writerPositiveControlProven:false,
  namespacePowerLossDurabilityProven:false,
  d01Approved:false,managedMutationAuthorized:false,
  cleanupAuthorized:false
};
const entry=object=>({object,opened:true,checked:true,
  write:false,delete:false,deleteChild:false,
  writeDacl:false,writeOwner:false,looksSafe:true,lastWin32Error:0});
function receipt(sid,variant,rootIdentity=root,projectIdentity=withId){
  const entries=['drive-root','ancestor-1','ancestor-2','project','state','agents'];
  if(variant==='with-manifest')entries.push('manifest');
  return {kind:'D01_WINDOWS_TOKEN_ACL_READONLY_V2',
    status:'NO_GO',platform:'win32',nativeWindows:true,
    productionProject:false,managedMutationAuthorized:false,
    publishedLegacyCliTested:false,nativePowerLossAttested:false,
    D01Approved:false,principalSid:sid,projectVariant:variant,
    rootIdentity,projectIdentity,observations:entries.map(entry),
    accessCheckOnly:true,oldPrincipalActualMutationDenialUnproven:true
  };
}
const pair=(variant,id)=>({
  oldPrincipalReceipt:receipt(oldSid,variant,root,id),
  writerPrincipalReceipt:receipt(writerSid,variant,root,id)
});
function good(){
  return {fixtureReceipt:fixture,
    withManifest:pair('with-manifest',withId),
    withoutManifest:pair('without-manifest',withoutId)};
}
test('exact same NTFS objects observed twice remain NO_GO',()=>{
  const reviewed=assessWindowsD01FixturePrincipalMatrix(good());
  assert.equal(reviewed.status,'NO_GO');
  assert.equal(reviewed.bothManifestStatesCovered,true);
  assert.equal(reviewed.correlatedReadOnlyReceipts.length,2);
  assert.equal(reviewed.independentNativeReceiptProvenance,false);
  assert.equal(reviewed.parentRenameDenialProven,false);
  assert.equal(reviewed.actualOldCliBinaryDenialProven,false);
  assert.equal(reviewed.managedMutationAuthorized,false);
  assert.equal(reviewed.d01Approved,false);
});

test('fixture identity cannot be swapped independently of either token report',()=>{
  const scenarios=[
    {fixtureReceipt:{...fixture,rootIdentity:'9'.repeat(24)}},
    {fixtureReceipt:{...fixture,withManifestIdentity:'8'.repeat(24)}},
    {fixtureReceipt:{...fixture,oldSid:writerSid}},
    {withManifest:pair('without-manifest',withId)},
    {withoutManifest:pair('without-manifest','7'.repeat(24))},
    {withoutManifest:{
      oldPrincipalReceipt:receipt(writerSid,'without-manifest',root,withoutId),
      writerPrincipalReceipt:receipt(oldSid,'without-manifest',root,withoutId)
    }}
  ];
  for(const changed of scenarios){
    assert.throws(()=>assessWindowsD01FixturePrincipalMatrix({
      ...good(),...changed
    }),e=>/^E_D01_WINDOWS_/.test(e.code));
  }
});
