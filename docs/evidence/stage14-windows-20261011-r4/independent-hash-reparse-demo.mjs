import {mkdtemp, mkdir, writeFile, readFile, symlink, lstat, rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import os from 'node:os';
import {pathToFileURL} from 'node:url';
const {resolveProjectPath} = await import(pathToFileURL('D:/vcp-stage14-r4/lib/safe-path.mjs').href);
const {inspectProject} = await import(pathToFileURL('D:/vcp-stage14-r4/lib/adoption-inspect.mjs').href);

const sha = b => createHash('sha256').update(b).digest('hex');
const root = await mkdtemp(path.join(os.tmpdir(), 'r4-hashdemo-root-'));
const outside = await mkdtemp(path.join(os.tmpdir(), 'r4-hashdemo-foreign-'));
const original = Buffer.from('FOREIGN USER BYTES R4 CAMPAIGN\r\n');
await writeFile(path.join(outside, 'secret.txt'), original);
const before = sha(await readFile(path.join(outside, 'secret.txt')));
console.log('external file:', path.join(outside, 'secret.txt'));
console.log('SHA256 BEFORE:', before);

// real junction (directory reparse point)
await mkdir(path.join(root, 'docs'));
const j = path.join(root, 'docs', 'jlink');
await symlink(outside, j, 'junction');
console.log('junction created, lstat.isSymbolicLink =', (await lstat(j)).isSymbolicLink());
try { await resolveProjectPath(root, 'docs/jlink/secret.txt', {purpose: 'read-existing'}); console.log('JUNCTION READ: NOT REFUSED (FAIL)'); }
catch (e) { console.log('junction read refused:', e.code, '-', e.message); }
try { await resolveProjectPath(root, 'docs/jlink/new.txt', {purpose: 'write-new'}); console.log('JUNCTION WRITE: NOT REFUSED (FAIL)'); }
catch (e) { console.log('junction write refused:', e.code, '-', e.message); }

// real file symlink (requires privilege; fails visibly if absent)
const fl = path.join(root, 'ext-link.txt');
await symlink(path.join(outside, 'secret.txt'), fl, 'file');
console.log('file symlink created, lstat.isSymbolicLink =', (await lstat(fl)).isSymbolicLink());
try { await resolveProjectPath(root, 'ext-link.txt', {purpose: 'read-existing'}); console.log('FILE SYMLINK: NOT REFUSED (FAIL)'); }
catch (e) { console.log('file symlink refused:', e.code, '-', e.message); }

// junction-selected root refusal
const linkedRoot = path.join(outside, 'linked-root');
await symlink(root, linkedRoot, 'junction');
const inspected = await inspectProject(linkedRoot);
console.log('junction-selected root:', inspected.classification, inspected.reason);

const after = sha(await readFile(path.join(outside, 'secret.txt')));
console.log('SHA256 AFTER: ', after);
console.log(before === after ? 'PRESERVATION: PASS (external bytes unchanged)' : 'PRESERVATION: FAIL');
await rm(root, {recursive: true, force: true});
await rm(outside, {recursive: true, force: true});
console.log('temp dirs cleaned');
