// D-01 Linux-only, root-provisioned OS-principal *disposable* proof fixture.
//
// This module NEVER changes a user-selected project, and NEVER authorizes
// managed v2 writes. It is a construction harness for a real kernel denial
// matrix, not a replacement for tests of the authenticated npm 0.9.3 CLI.
// Only root may provision an entirely NEW fixture under /tmp, whose root
// and parent namespace are not writable by the old UID. The two child
// projects intentionally differ ONLY in presence of .vcp/manifest.json.
//
// Kernel DAC exclusion of one unprivileged UID is not a complete D-01
// compatibility fence: privileged old-writer execution, MAC bypasses,
// user editing, actual npm entrypoints, races, ACLs and crash durability
// remain independently unproved.
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {chown,chmod,lstat,mkdtemp,mkdir,readFile,writeFile}
  from 'node:fs/promises';
import path from 'node:path';
import {decodeVerifiedLegacyArchiveBytes}
  from './d01-published-legacy-artifact.mjs';

const FIXTURE_PREFIX='/tmp/vcp-d01-os-isolation-';
// An object supplied by an untrusted caller is NOT a fixture capability.
// Only objects minted by this process after privileged creation may run.
const PROVISIONED=new WeakSet();
const STAGED=new WeakSet();
const PROBES=Object.freeze([
  'overwrite','unlink','rename','create-inside','replace-project'
]);
const WORKER=String.raw`
import {writeFile,unlink,rename,readFile} from 'node:fs/promises';
import path from 'node:path';
async function principal(){
  const status=await readFile('/proc/self/status','utf8');
  return {uid:process.getuid?.(),gid:process.getgid?.(),
    euid:process.geteuid?.(),egid:process.getegid?.(),
    groups:process.getgroups?.(),
    capEff:status.match(/^CapEff:\s*([0-9a-fA-F]+)$/m)?.[1]??null};
}
const [action,project] = process.argv.slice(1);
const source=path.join(project,'AGENTS.md');
async function attempt() {
  switch(action) {
    case 'overwrite':
      return writeFile(source,'OLD_WRITER_OVERWRITE\n');
    case 'unlink': return unlink(source);
    case 'rename': return rename(source,source+'.moved');
    case 'create-inside':
      return writeFile(path.join(project,'.vcp','intruder.bin'),'x',{flag:'wx'});
    case 'replace-project':
      return rename(project,project+'-replaced');
    case 'writer-positive':
      return writeFile(path.join(project,'writer-positive.bin'),'W',{flag:'wx'});
    default: throw new Error('UNKNOWN_FIXED_PROBE');
  }
}
try {
  await attempt();
  console.log(JSON.stringify({action,attempted:true,completed:true,code:null,
    ...await principal()}));
} catch(error) {
  console.log(JSON.stringify({action,attempted:true,completed:false,
    code:error?.code??'UNKNOWN',...await principal()}));
  process.exitCode=7;
}
`;
function refuse(code,details=''){
  const e=new Error(code+(details?': '+details:''));
  e.code=code;
  throw e;
}
function identity(value,name){
  if(!Number.isSafeInteger(value)||value<=0)
    refuse('E_D01_FIXTURE_PRINCIPAL',name);
  return value;
}
function sha(bytes){return createHash('sha256').update(bytes).digest('hex');}
function validateConfig({oldUid,oldGid,writerUid,writerGid,setprivPath}){
  if(process.platform!=='linux'||process.geteuid?.()!==0)
    refuse('E_D01_FIXTURE_ROOT_LINUX_REQUIRED');
  if(process.env.VCP_D01_DISPOSABLE_ISOLATION!=='I_UNDERSTAND_DISPOSABLE_ONLY')
    refuse('E_D01_FIXTURE_EXPLICIT_OPT_IN');
  for(const [name,value] of Object.entries({oldUid,oldGid,writerUid,writerGid}))
    identity(value,name);
  if(oldUid===writerUid)
    refuse('E_D01_FIXTURE_SAME_PRINCIPAL');
  if(!['/usr/bin/setpriv','/bin/setpriv'].includes(setprivPath))
    refuse('E_D01_FIXTURE_SETPRIV');
}
async function verifyScratchBase(){
  const st=await lstat('/tmp');
  if(!st.isDirectory()||st.isSymbolicLink()||
     st.uid!==0||(st.mode&0o1000)===0||
     (st.mode&0o111)!==0o111)
    refuse('E_D01_FIXTURE_TMP_UNTRUSTED');
}
async function ownership(full,uid,gid,mode){
  await chown(full,uid,gid);
  await chmod(full,mode);
}
async function createProject(root,name,uid,gid,manifestPresent){
  const project=path.join(root,name);
  // The legacy UID must be able to READ the project so its real published
  // CLI can reach lifecycle commands; DAC denies mutation independently.
  await mkdir(project,{mode:0o755});
  const agents=path.join(project,'AGENTS.md');
  const state=path.join(project,'.vcp');
  const original=Buffer.from('PROTECTED ORIGINAL USER BYTES: '+name+'\n');
  await writeFile(agents,original,{flag:'wx',mode:0o644});
  await mkdir(state,{mode:0o755});
  const manifestBytes=Buffer.from('{"fixture":true}\n');
  if(manifestPresent){
    const manifest=path.join(state,'manifest.json');
    await writeFile(manifest,manifestBytes,{flag:'wx',mode:0o644});
    await ownership(manifest,uid,gid,0o644);
  }
  await ownership(agents,uid,gid,0o644);
  await ownership(state,uid,gid,0o755);
  await ownership(project,uid,gid,0o755);
  return Object.freeze({root:project,manifestPresent,
    writerUid:uid,writerGid:gid,protectedSha256:sha(original),
    manifestSha256:manifestPresent?sha(manifestBytes):null});
}
function runAs({setprivPath,uid,gid,project,action}){
  // setpriv --clear-groups is essential. Dropping UID/GID while keeping
  // supplementary groups from root could make an old-writer proof invalid.
  // Only fixed, hardcoded operations are passed to the child; no shell.
  const args=['--reuid='+uid,'--regid='+gid,'--clear-groups',
    process.execPath,'--input-type=module','--eval',WORKER,action,project];
  const run=spawnSync(setprivPath,args,{
    shell:false,cwd:'/',timeout:10000,encoding:'utf8',
    maxBuffer:32768,
    env:{PATH:'/usr/bin:/bin',HOME:'/',NODE_OPTIONS:'',
      VCP_NO_NETWORK:'1'}
  });
  if(run.error||run.signal||![0,7].includes(run.status))
    refuse('E_D01_FIXTURE_CHILD_UNVERIFIED',
      String(run.error?.code??run.signal??run.status));
  let result;
  try{result=JSON.parse(run.stdout.trim());}
  catch{refuse('E_D01_FIXTURE_CHILD_PROTOCOL');}
  if(result?.action!==action||result.attempted!==true||
     result.uid!==uid||result.gid!==gid||
     result.euid!==uid||result.egid!==gid||
     !Array.isArray(result.groups)||
     result.groups.some(g=>g!==gid)||
     typeof result.capEff!=='string'||
     !/^[0-9a-fA-F]+$/.test(result.capEff)||
     !/^0+$/.test(result.capEff)||
     typeof result.completed!=='boolean'||
     (result.completed&&run.status!==0)||
     (!result.completed&&run.status!==7))
    refuse('E_D01_FIXTURE_CHILD_PROTOCOL');
  return Object.freeze({action,uid,exitCode:run.status,
    completed:result.completed,osError:result.code});
}
async function verifyFixture(project){
  const a=await lstat(project.root);
  if(a.isSymbolicLink()||!a.isDirectory()||
     a.uid!==project.writerUid||a.gid!==project.writerGid||
     (a.mode&0o777)!==0o755)
    refuse('E_D01_FIXTURE_IDENTITY_CHANGED');
  const file=await lstat(path.join(project.root,'AGENTS.md'));
  const state=await lstat(path.join(project.root,'.vcp'));
  if(!file.isFile()||file.isSymbolicLink()||file.nlink!==1||
     file.uid!==project.writerUid||file.gid!==project.writerGid||
     (file.mode&0o777)!==0o644||
     !state.isDirectory()||state.isSymbolicLink()||
     state.uid!==project.writerUid||state.gid!==project.writerGid||
     (state.mode&0o777)!==0o755)
    refuse('E_D01_FIXTURE_IDENTITY_CHANGED');
  const bytes=await readFile(path.join(project.root,'AGENTS.md'));
  if(sha(bytes)!==project.protectedSha256)
    refuse('E_D01_FIXTURE_PROTECTED_BYTES_CHANGED');
  const manifest=path.join(project.root,'.vcp','manifest.json');
  let manifestInfo=null;
  try{manifestInfo=await lstat(manifest);}
  catch(e){if(e.code!=='ENOENT')throw e;}
  if(Boolean(manifestInfo)!==project.manifestPresent)
    refuse('E_D01_FIXTURE_MANIFEST_CHANGED');
  if(manifestInfo){
    if(!manifestInfo.isFile()||manifestInfo.isSymbolicLink()||
       manifestInfo.nlink!==1||manifestInfo.uid!==project.writerUid||
       manifestInfo.gid!==project.writerGid||
       (manifestInfo.mode&0o777)!==0o644||
       sha(await readFile(manifest))!==project.manifestSha256)
      refuse('E_D01_FIXTURE_MANIFEST_CHANGED');
  }
  for(const forbidden of [
    path.join(project.root,'AGENTS.md.moved'),
    path.join(project.root,'.vcp','intruder.bin'),
    project.root+'-replaced'
  ]){
    try{
      await lstat(forbidden);
      refuse('E_D01_FIXTURE_UNEXPECTED_ENTRY',forbidden);
    }catch(e){if(e.code!=='ENOENT')throw e;}
  }
}

// Creates a *new* root-owned scratch namespace only. No caller-supplied
// project path, no cleanup of an existing path, and no installation of CLI.
export async function provisionD01LinuxFixture({
  oldUid,oldGid,writerUid,writerGid,
  setprivPath='/usr/bin/setpriv'
}={}){
  validateConfig({oldUid,oldGid,writerUid,writerGid,setprivPath});
  await verifyScratchBase();
  const tool=await lstat(setprivPath);
  if(!tool.isFile()||tool.isSymbolicLink()||tool.uid!==0)
    refuse('E_D01_FIXTURE_SETPRIV_UNTRUSTED');
  const root=await mkdtemp(FIXTURE_PREFIX);
  // Root stays owned by uid0: old users cannot chmod or rename it in
  // sticky /tmp. Traverse allowed; write and ownership remain root-only.
  await chmod(root,0o711);
  const present=await createProject(root,'with-manifest',
    writerUid,writerGid,true);
  const absent=await createProject(root,'without-manifest',
    writerUid,writerGid,false);
  const minted=Object.freeze({kind:'D01_DISPOSABLE_LINUX_FIXTURE_V1',
    root,oldUid,oldGid,writerUid,writerGid,setprivPath,
    projects:Object.freeze([present,absent]),
    productionProject:false,canAuthorizeManagedWrites:false,
    publishedCliAttested:false});
  PROVISIONED.add(minted);
  return minted;
}
function requireMintedFixture(fixture){
  if(!fixture||!PROVISIONED.has(fixture)||
     fixture.kind!=='D01_DISPOSABLE_LINUX_FIXTURE_V1'||
     typeof fixture.root!=='string'||
     !fixture.root.startsWith(FIXTURE_PREFIX)||
     !Array.isArray(fixture.projects)||fixture.projects.length!==2||
     fixture.projects[0].root!==path.join(fixture.root,'with-manifest')||
     fixture.projects[1].root!==path.join(fixture.root,'without-manifest')||
     fixture.projects[0].manifestPresent!==true||
     fixture.projects[1].manifestPresent!==false)
    refuse('E_D01_FIXTURE_RECEIPT_INVALID');
}
async function requireRootOwnedFixture(fixture){
  requireMintedFixture(fixture);
  if(process.platform!=='linux'||process.geteuid?.()!==0)
    refuse('E_D01_FIXTURE_ROOT_LINUX_REQUIRED');
  const st=await lstat(fixture.root);
  if(!st.isDirectory()||st.isSymbolicLink()||
     st.uid!==0||(st.mode&0o777)!==0o711)
    refuse('E_D01_FIXTURE_IDENTITY_CHANGED');
}
// The published package remains INERT DATA. The owner-supplied archive is
// verified against an independent SHA512, then copied only into the exact
// root-owned fixture minted by this process. No npm install or lifecycle
// scripts, no exec, no selected-project paths, no symlinks or tar utilities.
export async function stageD01VerifiedOldCliArchive(fixture,{
  archiveBytes,expectedSha512
}={}){
  await requireRootOwnedFixture(fixture);
  const decoded=decodeVerifiedLegacyArchiveBytes(archiveBytes,{
    expectedSha512
  });
  const dest=path.join(fixture.root,'legacy-package');
  await mkdir(dest,{mode:0o755}); // EEXIST refuses a reused stage.
  const dirs=new Set([dest]);
  let written=0;
  for(const member of decoded.fileBodies){
    const file=path.join(dest,member.path);
    if(!file.startsWith(dest+path.sep))
      refuse('E_D01_ARCHIVE_PATH');
    const parent=path.dirname(file);
    await mkdir(parent,{recursive:true,mode:0o755});
    let ancestor=parent;
    while(ancestor.startsWith(dest+path.sep)){
      dirs.add(ancestor);
      ancestor=path.dirname(ancestor);
    }
    await writeFile(file,member.bytes,{flag:'wx',mode:0o444});
    await chmod(file,0o444);
    written++;
  }
  for(const dir of [...dirs].sort((a,b)=>b.length-a.length))
    await chmod(dir,0o555);
  const entrypoint=path.join(dest,decoded.receipt.entrypoint);
  const entry=await lstat(entrypoint);
  if(!entry.isFile()||entry.isSymbolicLink()||entry.uid!==0||
     (entry.mode&0o777)!==0o444)
    refuse('E_D01_ARCHIVE_ENTRYPOINT_UNSAFE');
  const staged=Object.freeze({
    kind:'D01_STAGED_PUBLISHED_OLD_CLI_V1',status:'NO_GO',
    packageRoot:path.join(dest,'package'),entrypoint,
    expectedSha512:decoded.receipt.sha512,
    tarEntryCount:decoded.receipt.entryCount,
    extractedFileCount:written,
    stagedOnlyUnderMintedFixture:true,contentsReadOnly:true,
    npmLifecycleScriptsExecuted:false,oldCliInvoked:false,
    productionProjectTouched:false,managedMutationAuthorized:false,
    d01Approval:false
  });
  STAGED.add(staged);
  return staged;
}
export async function probeD01LinuxFixture(fixture){
  await requireRootOwnedFixture(fixture);
  const results=[];
  for(const project of fixture.projects){
    await verifyFixture(project);
    const attacks=[];
    for(const action of PROBES){
      const result=runAs({setprivPath:fixture.setprivPath,
        uid:fixture.oldUid,gid:fixture.oldGid,project:project.root,action});
      attacks.push(result);
      await verifyFixture(project);
    }
    const control=runAs({setprivPath:fixture.setprivPath,
      uid:fixture.writerUid,gid:fixture.writerGid,
      project:project.root,action:'writer-positive'});
    const controlBytes=await readFile(path.join(project.root,'writer-positive.bin'));
    if(!control.completed||controlBytes.toString('utf8')!=='W')
      refuse('E_D01_FIXTURE_WRITER_CONTROL_FAILED');
    results.push(Object.freeze({manifestPresent:project.manifestPresent,
      project:project.root,attacks:Object.freeze(attacks),
      writerPositiveControl:control,
      protectedSha256:project.protectedSha256}));
  }
  const denied=results.every(r=>r.attacks.every(a=>
    !a.completed&&['EACCES','EPERM'].includes(a.osError)));
  return Object.freeze({kind:'D01_LINUX_DAC_FIXTURE_RECEIPT_V1',
    status:'NO_GO',kernelDacDenialObserved:denied,
    distinctPrincipalExecutionObserved:true,
    publishedCliEntrypointsTested:false,
    protectedBytesCheckedAfterEachProbe:true,
    fixtures:Object.freeze(results),fixtureRoot:fixture.root,
    validForSelectedProjects:false,
    nativeWindowsProven:false,
    processCrashPowerLossProven:false,
    managedMutationAuthorized:false,
    d01Approval:false});
}


export const D01_PUBLISHED_OLD_CLI_MATRIX=Object.freeze([
  Object.freeze({scenario:'old-init-force',args:
    ['init','/work','--yes','--agent','all','--force','--no-github']}),
  Object.freeze({scenario:'old-update',args:['update','/work']}),
  Object.freeze({scenario:'old-manage-ignore',args:
    ['manage','ignore','AGENTS.md','--dir','/work']}),
  Object.freeze({scenario:'old-manage-track',args:
    ['manage','track','AGENTS.md','--dir','/work']}),
  Object.freeze({scenario:'old-rollback',args:['rollback','/work']})
]);
function approvedBwrap(binary){
  return ['/usr/bin/bwrap','/bin/bwrap'].includes(binary);
}
function sandboxArgs(project,staged,runTarget){
  // Every visible path is explicitly mounted. No selected project, home,
  // repo checkout, host /tmp, /run, /var, credentials or network is exposed.
  // Unlike --unshare-all's optional user namespace, --unshare-user is
  // mandatory. A host without working user namespaces must FAIL closed.
  return [
    '--unshare-user','--unshare-net','--unshare-pid','--unshare-ipc',
    '--unshare-uts','--die-with-parent','--new-session',
    '--cap-drop','ALL','--clearenv','--setenv','PATH','/usr/bin:/bin',
    '--setenv','HOME','/tmp','--setenv','NODE_OPTIONS','',
    '--setenv','npm_config_offline','true',
    '--ro-bind','/usr','/usr','--ro-bind-try','/lib','/lib',
    '--ro-bind-try','/lib64','/lib64','--symlink','usr/bin','/bin',
    '--dev','/dev','--proc','/proc','--tmpfs','/tmp',
    '--dir','/work','--bind',project.root,'/work',
    '--dir','/legacy','--ro-bind',staged.packageRoot,'/legacy',
    '--chdir','/work',process.execPath,...runTarget
  ];
}

const BWRAP_CANARY=String.raw`
import {readFile,readlink} from 'node:fs/promises';
import {createHash} from 'node:crypto';
async function ns(name){return readlink('/proc/self/ns/'+name);}
const original=await readFile('/work/AGENTS.md');
const status=await readFile('/proc/self/status','utf8');
const archiveMeta=JSON.parse(await readFile('/legacy/package.json','utf8'));
let manifestPresent=true;
try{await readFile('/work/.vcp/manifest.json');}
catch(e){if(e.code==='ENOENT')manifestPresent=false;else throw e;}
console.log(JSON.stringify({
  kind:'D01_NATIVE_SANDBOX_CANARY_V1',
  fileHash:createHash('sha256').update(original).digest('hex'),
  manifestPresent,oldPackageVersion:archiveMeta.version,
  capEff:status.match(/^CapEff:\s*([0-9a-fA-F]+)$/m)?.[1]??null,
  nsUser:await ns('user'),nsNet:await ns('net'),
  nsPid:await ns('pid'),nsIpc:await ns('ipc'),nsUts:await ns('uts')
}));
`;
async function hostNamespaces(){
  const {readlink}=await import('node:fs/promises');
  return Object.freeze({
    nsUser:await readlink('/proc/self/ns/user'),
    nsNet:await readlink('/proc/self/ns/net'),
    nsPid:await readlink('/proc/self/ns/pid'),
    nsIpc:await readlink('/proc/self/ns/ipc'),
    nsUts:await readlink('/proc/self/ns/uts')
  });
}
function executeIsolated(fixture,bwrapPath,project,staged,target){
  const args=['--reuid='+fixture.oldUid,
    '--regid='+fixture.oldGid,'--clear-groups','--no-new-privs',
    bwrapPath,...sandboxArgs(project,staged,target)];
  const run=spawnSync(fixture.setprivPath,args,{
    cwd:'/',shell:false,windowsHide:true,encoding:'utf8',
    maxBuffer:65536,timeout:12000,
    env:{PATH:'/usr/bin:/bin',HOME:'/',NODE_OPTIONS:'',
      npm_config_offline:'true'}
  });
  if(run.error||run.signal||!Number.isInteger(run.status))
    refuse('E_D01_PUBLISHED_SANDBOX_LAUNCH_FAILED');
  return run;
}
export async function probeD01PublishedLegacyCli(fixture,staged,{
  bwrapPath='/usr/bin/bwrap'
}={}){
  await requireRootOwnedFixture(fixture);
  if(!staged||!STAGED.has(staged)||
     staged.kind!=='D01_STAGED_PUBLISHED_OLD_CLI_V1'||
     staged.packageRoot!==path.join(fixture.root,'legacy-package','package')||
     !approvedBwrap(bwrapPath))
    refuse('E_D01_PUBLISHED_SANDBOX_CAPABILITY_REQUIRED');
  const bwrap=await lstat(bwrapPath);
  if(!bwrap.isFile()||bwrap.isSymbolicLink()||bwrap.uid!==0||
     (bwrap.mode&0o022)!==0)
    refuse('E_D01_PUBLISHED_BWRAP_UNTRUSTED');
  if(!process.execPath.startsWith('/usr/'))
    refuse('E_D01_PUBLISHED_NODE_RUNTIME_UNMOUNTED');
  const hosts=await hostNamespaces();
  const evidence=path.join(fixture.root,'published-cli-logs');
  await mkdir(evidence,{mode:0o700}); // Root-owned, exclusive evidence dir.
  const outcomes=[];
  for(const project of fixture.projects){
    await verifyFixture(project);
    const probe=executeIsolated(fixture,bwrapPath,project,staged,
      ['--input-type=module','--eval',BWRAP_CANARY]);
    let attestation;
    try{attestation=JSON.parse(probe.stdout.trim());}catch{
      refuse('E_D01_PUBLISHED_SANDBOX_NOT_VERIFIED');
    }
    if(probe.status!==0||
       attestation.kind!=='D01_NATIVE_SANDBOX_CANARY_V1'||
       attestation.fileHash!==project.protectedSha256||
       attestation.manifestPresent!==project.manifestPresent||
       attestation.oldPackageVersion!=='0.9.3'||
       typeof attestation.capEff!=='string'||
       !/^0+$/.test(attestation.capEff)||
       ['nsUser','nsNet','nsPid','nsIpc','nsUts'].some(key=>
         !attestation[key]||attestation[key]===hosts[key]))
      refuse('E_D01_PUBLISHED_SANDBOX_NOT_VERIFIED');
    await verifyFixture(project);
    for(const command of D01_PUBLISHED_OLD_CLI_MATRIX){
      const run=executeIsolated(fixture,bwrapPath,project,staged,
        ['/legacy/bin/vibe-coding-production.mjs',...command.args]);
      const prefix=(project.manifestPresent?'with':'without')+
        '-manifest-'+command.scenario;
      const stdoutName=prefix+'.stdout.txt';
      const stderrName=prefix+'.stderr.txt';
      await writeFile(path.join(evidence,stdoutName),run.stdout,
        {flag:'wx',mode:0o600});
      await writeFile(path.join(evidence,stderrName),run.stderr,
        {flag:'wx',mode:0o600});
      const receipt=Object.freeze({
        scenario:command.scenario,manifestPresent:project.manifestPresent,
        stdoutEvidence:'published-cli-logs/'+stdoutName,
        stderrEvidence:'published-cli-logs/'+stderrName,
        sandbox: 'bwrap-explicit-user-mount-net-pid-ipc-uts',
        requestedLegacyUid:fixture.oldUid,
        exitCode:run.status,
        stdoutSha256:sha(Buffer.from(run.stdout)),
        stderrSha256:sha(Buffer.from(run.stderr)),
        // Must NOT infer that the lifecycle mutation code was actually
        // reached from a nonzero exit or unchanged project contents.
        lifecycleWritePathReached:false,
        mutationDeniedByKernelProven:false,
        childIdentityIndependentlyAttested:false,
        publishedCliMainReachedProven:false
      });
      outcomes.push(receipt);
      await verifyFixture(project);
    }
  }
  return Object.freeze({
    kind:'D01_PUBLISHED_OLD_CLI_SANDBOX_OBSERVATIONS_V1',
    status:'NO_GO',packageDigest:staged.expectedSha512,
    scenarios:Object.freeze(outcomes),
    observationsCompleted:outcomes.length===D01_PUBLISHED_OLD_CLI_MATRIX.length*2,
    legacyCliCommandsAttempted:true,
    publishedCliEntrypointsReachedProven:false,
    publishedCliWritePathDenialProven:false,
    credentialsNamespaceAttested:false,
    processCrashPowerLossProven:false,
    WindowsAclExclusionProven:false,
    selectedProjectTouched:false,
    managedMutationAuthorized:false,d01Approval:false
  });
}
