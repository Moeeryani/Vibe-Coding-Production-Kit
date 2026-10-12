// Authenticated, offline inspection of the published npm 0.9.3 tarball.
// Construction support ONLY. This module never runs npm, extracts an
// archive, executes the old CLI, or authorizes Stage12/13 managed writes.
// Expected SHA-512 must come from an independently recorded published
// artifact identity; computing and trusting a digest from the same local
// file would NOT authenticate anything.
import {createHash,timingSafeEqual} from 'node:crypto';
import {readFile,lstat} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import path from 'node:path';

const MAX_ARCHIVE=16*1024*1024;
const MAX_UNPACKED=72*1024*1024;
const MAX_ENTRIES=4096;
const MAX_ENTRY=8*1024*1024;
const HEX512=/^[a-f0-9]{128}$/;
const SEGMENT=/^[A-Za-z0-9._@+-]{1,150}$/;
const ZERO_BLOCK=Buffer.alloc(512,0);
function fail(code){
  const e=new Error(code);e.code=code;throw e;
}
function textField(bytes){
  return bytes.subarray(0,bytes.indexOf(0)>=0?bytes.indexOf(0):bytes.length)
    .toString('utf8');
}
function numberField(bytes){
  const raw=textField(bytes).trim();
  if(!/^[0-7]+$/.test(raw))fail('E_D01_ARCHIVE_NUMERIC_FIELD');
  const value=Number.parseInt(raw,8);
  if(!Number.isSafeInteger(value)||value<0)
    fail('E_D01_ARCHIVE_NUMERIC_FIELD');
  return value;
}
function safeFileName(name,{directory=false}={}){
  // Standard tar writers commonly terminate directory names with '/'.
  // Strip exactly one trailing slash only for a directory header.
  if(directory&&name.endsWith('/'))name=name.slice(0,-1);
  if(typeof name!=='string'||
     !(name.startsWith('package/')||(directory&&name==='package'))||
     name.length>1024||name.includes('\\')||name.includes('//')||
     name.includes(String.fromCharCode(0))||name.normalize('NFC')!==name)
    fail('E_D01_ARCHIVE_PATH');
  const parts=name.split('/');
  if((parts.length<2 && !(directory&&name==='package'))||
     parts.length>24||
     parts.some(p=>!SEGMENT.test(p)||p==='.'||p==='..')||
     parts.some(p=>/[. ]$/.test(p)))
    fail('E_D01_ARCHIVE_PATH');
  return parts.join('/');
}
function checksum(block){
  let expected=numberField(block.subarray(148,156));
  let observed=0;
  for(let i=0;i<512;i++)observed+=i>=148&&i<156?32:block[i];
  if(observed!==expected)fail('E_D01_ARCHIVE_HEADER_CHECKSUM');
}
function paxPath(bytes){
  let offset=0,result=null;
  while(offset<bytes.length){
    const space=bytes.indexOf(32,offset);
    if(space<0||space-offset>9)fail('E_D01_ARCHIVE_PAX');
    const count=Number(bytes.toString('ascii',offset,space));
    if(!Number.isSafeInteger(count)||count<=space-offset+2||
       offset+count>bytes.length)
      fail('E_D01_ARCHIVE_PAX');
    const record=bytes.toString('utf8',space+1,offset+count);
    if(!record.endsWith('\n'))fail('E_D01_ARCHIVE_PAX');
    const equal=record.indexOf('=');
    if(equal<1)fail('E_D01_ARCHIVE_PAX');
    const key=record.slice(0,equal),value=record.slice(equal+1,-1);
    if(key==='path'){
      if(result!==null)fail('E_D01_ARCHIVE_PAX');
      result=value;
    }else if(!['mtime','atime','ctime','uid','gid','uname',
      'gname','size'].includes(key)){
      fail('E_D01_ARCHIVE_PAX_UNSUPPORTED');
    }else if(key==='size'){
      // A PAX size could override the per-header body size, defeating
      // our bounded parser. Refuse rather than silently disagree.
      fail('E_D01_ARCHIVE_PAX_UNSUPPORTED');
    }
    offset+=count;
  }
  return result;
}
function parseArchive(tar){
  const entries=[];
  const seen=new Set();
  let cursor=0,pendingPax=null,hasTerminator=false,packageJson=null;
  while(cursor+512<=tar.length){
    const block=tar.subarray(cursor,cursor+512);
    if(block.equals(ZERO_BLOCK)){
      if(cursor+1024>tar.length||
         !tar.subarray(cursor+512,cursor+1024).equals(ZERO_BLOCK))
        fail('E_D01_ARCHIVE_TRAILER');
      if(tar.subarray(cursor+1024).some(byte=>byte!==0))
        fail('E_D01_ARCHIVE_TRAILER');
      hasTerminator=true;
      break;
    }
    checksum(block);
    const rawName=textField(block.subarray(0,100));
    const prefix=textField(block.subarray(345,500));
    const name=prefix?prefix+'/'+rawName:rawName;
    const size=numberField(block.subarray(124,136));
    if(size>MAX_ENTRY)fail('E_D01_ARCHIVE_ENTRY_TOO_LARGE');
    const type=block[156];
    const next=cursor+512+Math.ceil(size/512)*512;
    if(next>tar.length)fail('E_D01_ARCHIVE_TRUNCATED');
    const bytes=tar.subarray(cursor+512,cursor+512+size);
    if(type===120){ // POSIX PAX per-entry extended header.
      if(pendingPax!==null)fail('E_D01_ARCHIVE_PAX');
      pendingPax=paxPath(bytes);
    }else{
      // Never accept links (incl. hardlinks), devices or global PAX
      // metadata. An attacker-controlled tarball must not be extracted.
      if(type!==48&&type!==0&&type!==53)
        fail('E_D01_ARCHIVE_UNSAFE_TYPE');
      const directory=type===53;
      const safe=safeFileName(pendingPax??name,{directory});
      pendingPax=null;
      const normalized=safe.toLowerCase();
      if(seen.has(normalized))fail('E_D01_ARCHIVE_DUPLICATE_PATH');
      seen.add(normalized);
      if(directory&&size!==0)fail('E_D01_ARCHIVE_DIRECTORY_DATA');
      // Directory headers are advisory only; a header for "package/"
      // cannot also be the same case-folded path as a regular file.
      if(safe==='package'&&!directory)
        fail('E_D01_ARCHIVE_UNSAFE_TYPE');
      const mode=numberField(block.subarray(100,108));
      if((mode&0o6000)!==0)fail('E_D01_ARCHIVE_EXECUTION_BITS');
      const entry=Object.freeze({path:safe,type:directory?'directory':'file',
        size,mode:mode&0o777});
      entries.push(entry);
      if(entries.length>MAX_ENTRIES)fail('E_D01_ARCHIVE_TOO_MANY_ENTRIES');
      if(safe==='package/package.json'){
        if(directory||size>100*1024)fail('E_D01_ARCHIVE_PACKAGE_JSON');
        try{packageJson=JSON.parse(bytes.toString('utf8'));}
        catch{fail('E_D01_ARCHIVE_PACKAGE_JSON');}
      }
    }
    cursor=next;
  }
  if(!hasTerminator||pendingPax!==null||!packageJson)
    fail('E_D01_ARCHIVE_INCOMPLETE');
  if(packageJson.name!=='vibe-coding-production'||
     packageJson.version!=='0.9.3'||
     packageJson.type!=='module'||
     packageJson.bin?.vcp!=='bin/vibe-coding-production.mjs'||
     packageJson.bin?.['vibe-coding-production']!==
       'bin/vibe-coding-production.mjs')
    fail('E_D01_ARCHIVE_IDENTITY_MISMATCH');
  if(!seen.has('package/bin/vibe-coding-production.mjs')||
     !seen.has('package/lib/cli.mjs'))
    fail('E_D01_ARCHIVE_MISSING_ENTRYPOINT');
  return Object.freeze({entries:Object.freeze(entries),
    packageName:packageJson.name,packageVersion:packageJson.version,
    entrypoint:'package/bin/vibe-coding-production.mjs'});
}
export function inspectPublishedLegacyArchiveBytes(archive,{
  expectedSha512
}={}){
  if(!Buffer.isBuffer(archive)||archive.length===0||
     archive.length>MAX_ARCHIVE)
    fail('E_D01_ARCHIVE_SIZE');
  if(typeof expectedSha512!=='string'||
     !HEX512.test(expectedSha512))
    fail('E_D01_EXPECTED_SHA512_REQUIRED');
  const digest=createHash('sha512').update(archive).digest('hex');
  if(!timingSafeEqual(Buffer.from(digest,'hex'),
                       Buffer.from(expectedSha512,'hex')))
    fail('E_D01_ARCHIVE_DIGEST_MISMATCH');
  let uncompressed;
  try{uncompressed=gunzipSync(archive,{maxOutputLength:MAX_UNPACKED});}
  catch{fail('E_D01_ARCHIVE_GZIP_INVALID');}
  const parsed=parseArchive(uncompressed);
  return Object.freeze({
    kind:'D01_PUBLISHED_LEGACY_ARCHIVE_READONLY_V1',
    source:'caller-supplied offline npm tarball',
    sha512:digest,byteLength:archive.length,
    entryCount:parsed.entries.length,entries:parsed.entries,
    packageName:parsed.packageName,packageVersion:parsed.packageVersion,
    entrypoint:parsed.entrypoint,authenticatedToExpectedDigest:true,
    // The expected digest's provenance is separate; this statement
    // never represents a signed/npm-registry attestation.
    independentlyPublishedDigestProven:false,
    scriptsExecuted:false,archiveExtracted:false,
    selectedProjectTouched:false,managedMutationAuthorized:false,
    d01Status:'NO_GO'
  });
}
export async function inspectPublishedLegacyArchiveFile(archivePath,opts={}){
  if(typeof archivePath!=='string'||!path.isAbsolute(archivePath))
    fail('E_D01_ARCHIVE_ABSOLUTE_PATH_REQUIRED');
  const st=await lstat(archivePath);
  if(!st.isFile()||st.isSymbolicLink()||st.nlink!==1||
     st.size<=0||st.size>MAX_ARCHIVE)
    fail('E_D01_ARCHIVE_FILE_UNSAFE');
  const bytes=await readFile(archivePath);
  const after=await lstat(archivePath);
  if(after.dev!==st.dev||after.ino!==st.ino||
     after.size!==st.size||after.mtimeMs!==st.mtimeMs)
    fail('E_D01_ARCHIVE_CHANGED_DURING_READ');
  return inspectPublishedLegacyArchiveBytes(bytes,opts);
}
