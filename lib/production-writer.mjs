// B-1 Production Writer — central mutation facade.
// All managed-state mutations flow through this boundary. It provides
// authorization hooks, identity verification hooks, evidence hooks, and
// the transaction lifecycle. No direct filesystem mutation exists behind
// new writer paths; mutations use lib/writer-atomic.mjs primitives.
//
// The D-01/G-FENCE gate is an authorization hook for v2 operations.
// Legacy v1 operations keep their existing authorization semantics;
// they gain identity, namespace, and evidence hooks without behavior change.
import { appendFile, open } from 'node:fs/promises';
import path from 'node:path';
import { assertManagedMigrationGate } from './managed-migration.mjs';
import {
  currentPrincipal,verifyPrincipal,verifyWriterBoundary,describePrincipal
} from './writer-identity.mjs';
import { acquireLifecycleLock } from './lifecycle-lock-v2.mjs';

export { verifyWriterBoundary,currentPrincipal,verifyPrincipal,describePrincipal };

// Append-only audit log. Never truncated, never rewritten.
export async function recordWriterEvidence({root,operation,principal,result}={}){
  const r=path.resolve(root);
  const entry={
    ts:new Date().toISOString(),operation,
    principal:describePrincipal(principal??currentPrincipal()),
    pid:process.pid,
    result:result===undefined?null:result
  };
  const line=Buffer.from(JSON.stringify(entry)+'\n');
  const logPath=path.join(r,'.vcp','writer-audit.log');
  let handle;
  try{
    handle=await open(logPath,'a',0o600);
    await handle.writeFile(line);
    await handle.sync();
  }catch(e){
    if(e&&e.code==='ENOENT')return {audited:false,reason:'NO_MANAGED_STATE'};
    throw e;
  }finally{
    if(handle)await handle.close();
  }
  return {audited:true};
}

// Authorization hook for v2 operations: the D-01/G-FENCE gate.
// Throws E_G_FENCE_NO_GO while writers are disabled. Not catchable for retry.
export function authorizeV2Operation(){
  assertManagedMigrationGate();
}

// Authorization hook for legacy v1 operations: existing semantics preserved.
// The writer boundary adds identity/namespace/evidence; it does not change
// what legacy operations are allowed to do.
export async function authorizeLegacyOperation({root,operation}={}){
  return verifyWriterBoundary({root,operation});
}

// Full transaction lifecycle for new writer paths.
// mutate:    async ({root,lock,principal,atomic}) => result
// testCapability: optional test-only authorization. When present, the
//   capability is verified INSTEAD OF the production gate. Production
//   entrypoints never provide testCapability; they always run the gate.
//   The verifier lives in test/helpers/ (excluded from the npm artifact);
//   it is imported dynamically only on this path.
//
// SECURITY (M-3 fix): there is no `authorize` injection parameter. The
// authorization decision is fixed: production gate OR verified test
// capability. An in-process caller cannot supply an alternative
// authorization callback.
export async function runWriterTransaction({
  root,operation,schema=2,mode='update',mutate,
  testCapability=null
}={}){
  if(typeof mutate!=='function')
    throw new Error('runWriterTransaction requires a mutate function.');
  const r=path.resolve(root);
  // 1. Boundary: live principal known, namespace contained.
  const boundary=await verifyWriterBoundary({root:r,operation});
  // 2. Authorization: production gate OR verified test capability (never both
  //    skipped, never a generic bypass, never caller-injected).
  if(testCapability){
    const { verifyTestCapability }=
      await import('../test/helpers/controlled-writer-capability.mjs');
    await verifyTestCapability(testCapability,{root:r,operation});
  }else{
    authorizeV2Operation();
  }
  // 3. Unified lock (v2 lifecycle lock; owner-pinned, inode-verified).
  const lock=await acquireLifecycleLock(r,{mode});
  let lockHeld=true;
  try{
    // 4. Per-phase identity re-verification: the principal must not change
    //    between authorization and mutation.
    verifyPrincipal(boundary.principal,currentPrincipal());
    // 4b. B-9: pin root identity AFTER authorization, verify before mutation.
    //     Detects parent rename/replacement races. Pinning here (not in
    //     boundary) ensures auth failures are reported correctly.
    const { pinPathIdentity, verifyPathIdentity }=await import('./writer-identity.mjs');
    const identityPin=await pinPathIdentity(r);
    await verifyPathIdentity(r,identityPin);
    // 5. Mutate through atomic primitives only.
    const { atomicWriteFile }=await import('./writer-atomic.mjs');
    const result=await mutate({root:r,lock,principal:boundary.principal,
      atomic:{writeFile:atomicWriteFile}});
    // 5b. Post-mutation re-verification (B4-03): the fixture identity must
    //     not have changed during mutate. Fail closed before evidence write.
    if(testCapability){
      const { verifyTestCapability: reverify }=
        await import('../test/helpers/controlled-writer-capability.mjs');
      await reverify(testCapability,{root:r,operation});
    }
    // 6. Evidence hook.
    await recordWriterEvidence({root:r,operation,
      principal:boundary.principal,result:{schema,ok:true}});
    return result;
  }finally{
    if(lockHeld)await lock.release().catch(()=>{});
  }
}
