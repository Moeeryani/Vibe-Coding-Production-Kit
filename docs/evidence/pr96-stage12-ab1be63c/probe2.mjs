import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
const { resolveProjectPath } = await import('/tmp/pr96b/lib/safe-path.mjs');
const { parseManagedSections, replaceManagedSection } = await import('/tmp/pr96b/lib/managed-markdown.mjs');
let pass = 0, fail = 0;
function ok(name, cond) { cond ? pass++ : fail++; console.log((cond ? 'PASS' : 'FAIL') + ' ' + name); }
async function refuses(name, root, rel, opts) {
  try { await resolveProjectPath(root, rel, opts); ok(name, false); }
  catch (e) { ok(name, e.code === 'E_VCP_PATH'); }
}
const root = await mkdtemp(path.join(os.tmpdir(), 'vcp-probe-sp-'));
await writeFile(path.join(root, 'ok.txt'), 'x');
await mkdir(path.join(root, 'sub'));
await writeFile(path.join(root, 'sub', 'f.txt'), 'y');
await symlink(path.join(root, 'ok.txt'), path.join(root, 'link.txt'));
// unsafe relatives
await refuses('traversal ../ refused', root, '../evil', { purpose: 'read-existing' });
await refuses('absolute refused', root, '/etc/passwd', { purpose: 'read-existing' });
await refuses('win absolute refused', root, 'C:/x', { purpose: 'read-existing' });
await refuses('NUL refused', root, 'a\0b', { purpose: 'read-existing' });
await refuses('backslash refused', root, 'a\\b', { purpose: 'read-existing' });
await refuses('dot component refused', root, './ok.txt', { purpose: 'read-existing' });
await refuses('.git refused', root, '.git/config', { purpose: 'read-existing' });
await refuses('reserved name NUL.txt refused', root, 'NUL.txt', { purpose: 'read-existing' });
await refuses('trailing dot refused', root, 'evil.', { purpose: 'read-existing' });
await refuses('.vcp read without managed-state', root, '.vcp/manifest.json', { purpose: 'read-existing' });
await refuses('non-.vcp with managed-state', root, 'ok.txt', { purpose: 'managed-state' });
// in-root symlink refused even for read
await refuses('in-root symlink refused (read)', root, 'link.txt', { purpose: 'read-existing' });
// symlink inside subdir as parent
await symlink(path.join(root, 'sub'), path.join(root, 'dirlink'));
await refuses('symlinked parent dir refused', root, 'dirlink/f.txt', { purpose: 'read-existing' });
// legitimate reads still work
{
  const p = await resolveProjectPath(root, 'sub/f.txt', { purpose: 'read-existing' });
  ok('legit nested read works', p.endsWith(path.join('sub', 'f.txt')));
}
// write-new refuses existing destination
await refuses('write-new refuses existing', root, 'ok.txt', { purpose: 'write-new' });
{
  const p = await resolveProjectPath(root, 'brand-new.txt', { purpose: 'write-new' });
  ok('write-new missing destination resolves', p.endsWith('brand-new.txt'));
}
// byte preservation: BOM + CRLF + Unicode
{
  const doc = Buffer.concat([Buffer.from([0xEF, 0xBB, 0xBF]), Buffer.from('# Titre \u00e9\u4e2d\r\n<!-- VCP:BEGIN:sec-1 -->\r\nold \u00e9\r\n<!-- VCP:END:sec-1 -->\r\ntail \u4e2d\r\n')]);
  const out = replaceManagedSection(doc, 'sec-1', 'new \u00e9');
  const expected = Buffer.concat([Buffer.from([0xEF, 0xBB, 0xBF]), Buffer.from('# Titre \u00e9\u4e2d\r\n<!-- VCP:BEGIN:sec-1 -->\r\nnew \u00e9<!-- VCP:END:sec-1 -->\r\ntail \u4e2d\r\n')]);
  ok('byte-preserving replace (BOM/CRLF/unicode)', out.equals(expected));
}
// marker inside fenced code ignored
{
  const doc = '```\n<!-- VCP:BEGIN:fake -->\n```\n<!-- VCP:BEGIN:real -->\nx\n<!-- VCP:END:real -->\n';
  const locs = parseManagedSections(doc);
  ok('fenced marker ignored', locs.length === 1 && locs[0].id === 'real');
}
// duplicate id rejected
{
  let threw = false;
  try { parseManagedSections('<!-- VCP:BEGIN:a -->\nx\n<!-- VCP:END:a -->\n<!-- VCP:BEGIN:a -->\ny\n<!-- VCP:END:a -->\n'); } catch (e) { threw = e.code === 'E_VCP_SECTION'; }
  ok('duplicate id rejected', threw);
}
await rm(root, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
