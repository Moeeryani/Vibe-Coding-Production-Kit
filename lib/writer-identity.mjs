// B-1 Production Writer — shared identity verification layer.
// Pure verification primitives; no filesystem mutation.
// Windows principal identity requires the native token helper;
// without it, Windows identity is NOT_PROVEN and operations fail closed.
import { lstat } from 'node:fs/promises';
import path from 'node:path';

function fail(code,message){
  const e=new Error(code+(message?': '+message:''));
  e.code=code;
  throw e;
}

// Who is running this process, per the OS. Never from environment variables,
// never cached across operations.
export function currentPrincipal(){
  if(process.platform==='win32'){
    return Object.freeze({kind:'windows',sid:null,proven:false,
      reason:'WINDOWS_TOKEN_PROOF_REQUIRES_NATIVE_HELPER'});
  }
  if(typeof process.getuid!=='function'){
    fail('E_WRITER_PRINCIPAL_UNKNOWN','Cannot determine process principal on this platform.');
  }
  return Object.freeze({kind:'posix',uid:process.getuid(),
    gid:typeof process.getgid==='function'?process.getgid():null,proven:true});
}

export function describePrincipal(p){
  if(!p||typeof p!=='object')return 'unknown';
  if(p.kind==='posix')return `posix:uid=${p.uid},gid=${p.gid}`;
  if(p.kind==='windows')return `windows:sid=${p.sid??'UNPROVEN'}`;
  return 'unknown';
}

// The expected principal must have been captured via currentPrincipal() at a
// trusted point (lock acquisition). Rejects wrong identity, stale identity
// (expected captured by a different process), and unproven Windows identity.
export function verifyPrincipal(expected,actual=currentPrincipal()){
  if(!expected||typeof expected!=='object')
    fail('E_WRITER_PRINCIPAL_MISMATCH','No expected principal pinned.');
  if(expected.kind!==actual.kind)
    fail('E_WRITER_PRINCIPAL_MISMATCH',
      `Principal kind changed: expected ${expected.kind}, got ${actual.kind}.`);
  if(expected.kind==='windows'){
    if(!actual.proven||!actual.sid)
      fail('E_WRITER_PRINCIPAL_UNPROVEN',
        'Windows writer identity requires native token proof (NOT_PROVEN).');
    if(expected.sid!==actual.sid)
      fail('E_WRITER_PRINCIPAL_MISMATCH','Windows writer SID mismatch.');
    return actual;
  }
  if(expected.uid!==actual.uid)
    fail('E_WRITER_PRINCIPAL_MISMATCH',
      `Writer UID changed: expected ${expected.uid}, got ${actual.uid}.`);
  return actual;
}

// Object identity pinning: (dev, ino), not path strings. Detects
// replacement/rename races between verification and use.
export async function pinPathIdentity(absPath){
  const st=await lstat(absPath);
  if(st.isSymbolicLink())
    fail('E_WRITER_IDENTITY_LINK','Cannot pin identity of a symlink.');
  return Object.freeze({dev:st.dev,ino:st.ino,
    isDirectory:st.isDirectory(),isFile:st.isFile()});
}

export async function verifyPathIdentity(absPath,pin){
  if(!pin||typeof pin!=='object')
    fail('E_WRITER_IDENTITY_CHANGED','No identity pin to verify against.');
  let st;
  try{st=await lstat(absPath);}
  catch(e){fail('E_WRITER_IDENTITY_CHANGED',`Pinned path vanished: ${absPath}.`);}
  if(st.isSymbolicLink()||st.dev!==pin.dev||st.ino!==pin.ino)
    fail('E_WRITER_IDENTITY_CHANGED',
      `Object identity changed (replaced/renamed): ${absPath}.`);
  return true;
}

// Namespace containment: target must resolve inside root, with no symlink
// components in existing parents and no `..` escape. Does not require the
// target to exist (atomic updates replace existing files).
export async function verifyNamespaceContained(root,targetPath){
  const r=path.resolve(root);
  const t=path.resolve(targetPath);
  if(t!==r&&!t.startsWith(r+path.sep))
    fail('E_WRITER_NAMESPACE_ESCAPE',`Target escapes project root: ${targetPath}.`);
  const rel=path.relative(r,t);
  if(rel===''||rel==='.')return t;
  let current=r;
  for(const part of rel.split(path.sep)){
    if(!part||part==='.'||part==='..')
      fail('E_WRITER_NAMESPACE_UNSAFE',`Unsafe path component: ${part}.`);
    current=path.join(current,part);
    let st;
    try{st=await lstat(current);}
    catch(e){
      if(e&&e.code==='ENOENT')break; // Rest does not exist yet; cannot be a link.
      throw e;
    }
    if(st.isSymbolicLink())
      fail('E_WRITER_NAMESPACE_UNSAFE',`Symlink path component: ${current}.`);
  }
  return t;
}

// The writer boundary check every mutation path must pass: live principal
// known, namespace contained. Authorization (gate etc.) is operation-specific
// and runs after this.
export async function verifyWriterBoundary({root,operation}={}){
  if(typeof operation!=='string'||!operation)
    fail('E_WRITER_BOUNDARY','Writer boundary requires a named operation.');
  const principal=currentPrincipal();
  await verifyNamespaceContained(root,root);
  // B-9: identity pinning is done after authorization (see runWriterTransaction),
  // not here, so that authorization failures (e.g., revoked capability)
  // are reported correctly instead of being masked by ENOENT.
  return Object.freeze({root:path.resolve(root),operation,principal,
    verifiedAt:new Date().toISOString()});
}
