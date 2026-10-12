// Portable Win32 D-01 identity / ACL receipt contracts; no native
// helper execution or product writer is invoked by these tests.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {
  validateWindowsD01ReadOnlyReceipt,assessWindowsD01DualPrincipal
} from '../lib/windows-d01-token-evidence.mjs';
import {MANAGED_SCHEMA_MIGRATION_GATE} from '../lib/managed-migration.mjs';

const SID_A='S-1-5-21-100-200-300-1001';
const SID_B='S-1-5-21-100-200-300-1002';
const observation=(object,extra={})=>({
  object,opened:true,checked:true,write:false,
  delete:false,deleteChild:false,
  writeDacl:false,writeOwner:false,looksSafe:true,
  lastWin32Error:0,...extra
});
function receipt(sid=SID_A,variant='with-manifest',changes={}){
  const names=['drive-root','ancestor-1','ancestor-2','project','state','agents'];
  if(variant==='with-manifest')names.push('manifest');
  return {kind:'D01_WINDOWS_TOKEN_ACL_READONLY_V1',
    status:'NO_GO',platform:'win32',
    nativeWindows:true,productionProject:false,
    managedMutationAuthorized:false,publishedLegacyCliTested:false,
    nativePowerLossAttested:false,D01Approved:false,
    principalSid:sid,projectVariant:variant,
    observations:names.map(n=>observation(n)),
    accessCheckOnly:true,
    oldPrincipalActualMutationDenialUnproven:true,
    ...changes
  };
}
test('closed native Win32 receipt never grants D01 even with no ACL grants',()=>{
  const v=validateWindowsD01ReadOnlyReceipt(receipt());
  assert.equal(v.status,'NO_GO');
  assert.equal(v.completeReadOnlyAclSnapshot,true);
  assert.equal(v.oldProcessTokenAttestedIndependently,false);
  assert.equal(v.publishedV093KernelDenialProven,false);
  assert.equal(v.managedMutationAuthorized,false);
  assert.equal(MANAGED_SCHEMA_MIGRATION_GATE.status,'NO_GO');
});

test('dual distinct SID receipts do not constitute a published CLI denial proof',()=>{
  const writer=receipt(SID_B,'with-manifest');
  writer.observations[5]=observation('agents',{
    write:true,looksSafe:false
  });
  const p=assessWindowsD01DualPrincipal({
    oldPrincipalReceipt:receipt(),writerPrincipalReceipt:writer
  });
  assert.equal(p.status,'NO_GO');
  assert.equal(p.principalsDifferent,true);
  assert.equal(p.writerWriteCapabilityObserved,true);
  assert.equal(p.actualOldCliKernelDenialProven,false);
  assert.equal(p.nativeAclAtomicityProven,false);
});

test('same SID and mismatched fixture variants fail closed',()=>{
  assert.throws(()=>assessWindowsD01DualPrincipal({
    oldPrincipalReceipt:receipt(SID_A),
    writerPrincipalReceipt:receipt(SID_A)
  }),{code:'E_D01_WINDOWS_ACL_SAME_PRINCIPAL'});
  assert.throws(()=>assessWindowsD01DualPrincipal({
    oldPrincipalReceipt:receipt(SID_A,'with-manifest'),
    writerPrincipalReceipt:receipt(SID_B,'without-manifest')
  }),{code:'E_D01_WINDOWS_ACL_VARIANT_MISMATCH'});
});

test('falsified safe flag, missing ancestor and spoofed mutating proof refused',()=>{
  for(const bad of [
    {D01Approved:true},
    {managedMutationAuthorized:true},
    {principalSid:'1001'},
    {accessCheckOnly:false},
    {status:'GO'},
    {projectVariant:'with-manifest',observations:receipt().observations
      .filter(o=>o.object!=='manifest')},
    {observations:receipt().observations.filter(o=>o.object!=='ancestor-1')},
    {observations:receipt().observations.map(o=>o.object==='agents'?
      {...o,write:true,looksSafe:true}:o)},
    {observations:receipt().observations.map(o=>o.object==='agents'?
      {...o,opened:false,checked:true,looksSafe:true}:o)}
  ]){
    assert.throws(()=>validateWindowsD01ReadOnlyReceipt(
      receipt(SID_A,'with-manifest',bad)),
    e=>/^E_D01_WINDOWS_ACL_/.test(e.code));
  }
});

test('unknown fields, duplicate entries, partial or failed checks never masquerade as complete',()=>{
  assert.throws(()=>validateWindowsD01ReadOnlyReceipt(
    receipt(SID_A,'with-manifest',{unexpectedWriterGrant:true})),
  {code:'E_D01_WINDOWS_ACL_RECEIPT_INVALID'});
  assert.throws(()=>validateWindowsD01ReadOnlyReceipt(
    receipt(SID_A,'with-manifest',{observations:[
      ...receipt().observations,observation('agents')
    ]})),{code:'E_D01_WINDOWS_ACL_DUPLICATE'});
  const original=receipt(SID_A);
  original.observations[5]=observation('agents',{
    checked:false,looksSafe:false,lastWin32Error:5
  });
  const v=validateWindowsD01ReadOnlyReceipt(original);
  assert.equal(v.completeReadOnlyAclSnapshot,false);
  assert.equal(v.status,'NO_GO');
});
