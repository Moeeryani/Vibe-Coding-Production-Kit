// Stage12 versioned backup constructor for managed manifest-only schema changes.
// Caller must hold the lifecycle lock and confirm the selected root is managed.
// No generic recursive copy and no migration of project-owned file bytes.
import { randomBytes, createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, mkdir, open, rmdir } from 'node:fs/promises';
import path from 'node:path';
import { resolveProjectPath } from './safe-path.mjs';
import { describeVersionedBackup } from './managed-recovery-v2.mjs';
import { syncContainingDirectory } from './file-durability.mjs';

const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const MAX_MANIFEST_BYTES=256*1024;
function refuse(code){const e=new Error(code);e.code=code;throw e;}
async function ensureOwnedDirectory(root,relative) {
  const parts=relative.split('/');
  let at='';
  for(const component of parts) {
    at=at?at+'/'+component:component;
    // Resolve a missing child beneath the directory: the path helper's
    // final component contract is file-only, while mkdir targets directories.
    const child=await resolveProjectPath(root,at+'/.__vcp_dir_probe__',{
      purpose:'managed-state'
    });
    const file=path.dirname(child);
    let current;
    try{current=await lstat(file);}catch(e){if(e.code!=='ENOENT')throw e;}
    if(current) {
      if(!current.isDirectory()||current.isSymbolicLink())refuse('E_BACKUP_PARENT');
      continue;
    }
    try{await mkdir(file,{mode:0o700});await syncContainingDirectory(file);}
    catch(error){
      // A newly created unexpected directory is not automatically owned.
      if(error.code!=='EEXIST')throw error;
      refuse('E_BACKUP_PARENT_RACE');
    }
  }
}
async function writeNewState(root,relative,bytes) {
  const file=await resolveProjectPath(root,relative,{purpose:'managed-state'});
  const fd=await open(file,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|
    (constants.O_NOFOLLOW??0),0o600);
  try{await fd.writeFile(bytes);await fd.sync();}
  finally{await fd.close();}
  await syncContainingDirectory(file);
}
export async function createManagedSchemaBackup(root,{
  manifestBytes,installedVersion,minimumReaderVersion,priorBaselinesExisted
}={}) {
  const source=Buffer.from(manifestBytes??Buffer.alloc(0));
  if(!source.length||source.length>MAX_MANIFEST_BYTES||
    typeof installedVersion!=='string'||typeof priorBaselinesExisted!=='boolean') {
    refuse('E_BACKUP_PRELOCK');
  }
  const rootResolved=path.resolve(root);
  await ensureOwnedDirectory(rootResolved,'.vcp/backups');
  const id=new Date().toISOString().replace(/[:.]/g,'-')+'-'+randomBytes(8).toString('hex');
  const relative='.vcp/backups/'+id;
  // Operation directory always uses exclusive creation; a collision never
  // becomes a previous backup that can be silently overwritten.
  const child=await resolveProjectPath(rootResolved,relative+'/.__vcp_dir_probe__',{
    purpose:'managed-state'
  });
  await mkdir(path.dirname(child),{mode:0o700});
  await syncContainingDirectory(path.dirname(child));
  const manifestHash=digest(source);
  await writeNewState(rootResolved,relative+'/manifest.json',source);
  const record=describeVersionedBackup({
    id,operationId:id,operation:'update',minimumReaderVersion,
    restoredManifestHash:manifestHash,
    preLockSnapshot:{
      vcpDirectoryExisted:true,manifestExisted:true,
      baselinesExisted:priorBaselinesExisted,installedVersion,
      lockBootstrapCreatedVcpDirectory:false
    },
    entries:[]
  });
  await writeNewState(rootResolved,relative+'/backup.json',
    Buffer.from(JSON.stringify({...record,installedVersion},null,2)+'\n'));
  return {...record,id,installedVersion};
}


export async function createGreenfieldRecoveryBackup(root,{minimumReaderVersion}={}) {
  const selected=path.resolve(root);
  await ensureOwnedDirectory(selected,'.vcp/backups');
  const id=new Date().toISOString().replace(/[:.]/g,'-')+'-'+randomBytes(8).toString('hex');
  const base='.vcp/backups/'+id;
  const probe=await resolveProjectPath(selected,base+'/.__vcp_dir_probe__',{
    purpose:'managed-state'
  });
  await mkdir(path.dirname(probe),{mode:0o700});
  await syncContainingDirectory(path.dirname(probe));
  const filesDir=path.join(selected,base,'files');
  await mkdir(filesDir,{mode:0o700});
  await syncContainingDirectory(filesDir);
  const record=describeVersionedBackup({
    id,operationId:id,operation:'init',minimumReaderVersion,
    restoredManifestHash:null,entries:[],
    preLockSnapshot:{
      vcpDirectoryExisted:false,manifestExisted:false,
      baselinesExisted:false,installedVersion:null,
      lockBootstrapCreatedVcpDirectory:true
    }
  });
  await writeNewState(selected,base+'/backup.json',
    Buffer.from(JSON.stringify(record,null,2)+'\n'));
  return {...record,id};
}
