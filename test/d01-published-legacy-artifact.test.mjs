// Offline published-old-CLI artifact contracts. No downloads, installs,
// process execution or filesystem mutation to a selected project.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {inspectPublishedLegacyArchiveBytes} from
  '../lib/d01-published-legacy-artifact.mjs';

const pkg={
  name:'vibe-coding-production',version:'0.9.3',type:'module',
  bin:{vcp:'bin/vibe-coding-production.mjs',
    'vibe-coding-production':'bin/vibe-coding-production.mjs'}
};
const base=[
  {name:'package/',type:'directory'},
  {name:'package/package.json',data:JSON.stringify(pkg)},
  {name:'package/bin/',type:'directory'},
  {name:'package/bin/vibe-coding-production.mjs',data:'// no execution\n'},
  {name:'package/lib/',type:'directory'},
  {name:'package/lib/cli.mjs',data:'export const x=1;\n'}
];
function octal(h,start,length,value){
  const s=value.toString(8).padStart(length-1,'0')+'\0';
  h.write(s,start,length,'ascii');
}
function header(entry){
  const h=Buffer.alloc(512);
  const name=entry.name;
  if(Buffer.byteLength(name)>100)throw Error('test name too long');
  h.write(name,0,100,'utf8');
  octal(h,100,8,entry.mode??(entry.type==='directory'?0o755:0o644));
  octal(h,108,8,0);
  octal(h,116,8,0);
  const data=Buffer.from(entry.data??'','utf8');
  octal(h,124,12,data.length);
  octal(h,136,12,0);
  h.fill(32,148,156);
  h[156]=entry.flag??(entry.type==='directory'?53:48);
  h.write('ustar\0',257,6);
  h.write('00',263,2);
  let sum=0;for(const b of h)sum+=b;
  octal(h,148,8,sum);
  return [h,data,Buffer.alloc((512-data.length%512)%512)];
}
function archive(entries=base){
  const chunks=entries.flatMap(header);
  chunks.push(Buffer.alloc(1024));
  const tgz=gzipSync(Buffer.concat(chunks));
  return {tgz,digest:createHash('sha512').update(tgz).digest('hex')};
}
test('independently supplied SHA512 and exact package identity create read-only NO-GO inventory',()=>{
  const {tgz,digest}=archive();
  const result=inspectPublishedLegacyArchiveBytes(tgz,{
    expectedSha512:digest
  });
  assert.equal(result.packageName,'vibe-coding-production');
  assert.equal(result.packageVersion,'0.9.3');
  assert.equal(result.entryCount,base.length);
  assert.equal(result.authenticatedToExpectedDigest,true);
  assert.equal(result.independentlyPublishedDigestProven,false);
  assert.equal(result.archiveExtracted,false);
  assert.equal(result.scriptsExecuted,false);
  assert.equal(result.selectedProjectTouched,false);
  assert.equal(result.managedMutationAuthorized,false);
  assert.equal(result.d01Status,'NO_GO');
});

test('artifact fails if digest was derived from a different archive',()=>{
  const {tgz}=archive();
  assert.throws(()=>inspectPublishedLegacyArchiveBytes(tgz,{
    expectedSha512:'0'.repeat(128)
  }),{code:'E_D01_ARCHIVE_DIGEST_MISMATCH'});
  assert.throws(()=>inspectPublishedLegacyArchiveBytes(tgz),
    {code:'E_D01_EXPECTED_SHA512_REQUIRED'});
});

test('rejects path traversal, symlink and hardlink members despite valid externally supplied digest',()=>{
  for(const entry of [
    {name:'package/../etc/passwd',data:'unsafe'},
    {name:'package/escape/',type:'directory',flag:50},
    {name:'package/shortcut',flag:50,data:''},
    {name:'package/hardlink',flag:49,data:''},
    {name:'package/aux',flag:51,data:''},
    {name:'package/AGENTS.md',data:'user',mode:0o4755}
  ]){
    const {tgz,digest}=archive([...base,entry]);
    assert.throws(()=>inspectPublishedLegacyArchiveBytes(tgz,{
      expectedSha512:digest
    }),e=>/^E_D01_ARCHIVE_/.test(e.code));
  }
});

test('rejects duplicate identities, casefolded paths and missing CLI file',()=>{
  for(const entries of [
    [...base,{name:'package/lib/CLI.mjs',data:'shadow'}],
    [...base,{name:'package/package.json',data:'{}'}],
    base.filter(e=>e.name!=='package/lib/cli.mjs')
  ]){
    const {tgz,digest}=archive(entries);
    assert.throws(()=>inspectPublishedLegacyArchiveBytes(tgz,{
      expectedSha512:digest
    }),e=>/^E_D01_ARCHIVE_/.test(e.code));
  }
});

test('a tarball self-declaring a newer CLI version never passes 0.9.3 attestation',()=>{
  const entries=base.map(e=>e.name==='package/package.json'?
    {...e,data:JSON.stringify({...pkg,version:'0.9.4'})}:e);
  const {tgz,digest}=archive(entries);
  assert.throws(()=>inspectPublishedLegacyArchiveBytes(tgz,{
    expectedSha512:digest
  }),{code:'E_D01_ARCHIVE_IDENTITY_MISMATCH'});
});

test('raw malformed gzip and malformed tar checksum are rejected without extraction',()=>{
  const invalid=Buffer.from('not a gzip');
  const digest=createHash('sha512').update(invalid).digest('hex');
  assert.throws(()=>inspectPublishedLegacyArchiveBytes(invalid,{
    expectedSha512:digest
  }),{code:'E_D01_ARCHIVE_GZIP_INVALID'});
  const raw=Buffer.concat([...base.flatMap(header),Buffer.alloc(1024)]);
  raw[25]^=1;
  const modified=gzipSync(raw);
  assert.throws(()=>inspectPublishedLegacyArchiveBytes(modified,{
    expectedSha512:createHash('sha512').update(modified).digest('hex')
  }),{code:'E_D01_ARCHIVE_HEADER_CHECKSUM'});
});
