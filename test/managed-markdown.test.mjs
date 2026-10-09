import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseManagedSections, replaceManagedSection } from '../lib/managed-markdown.mjs';

test('managed sections preserve outside bytes: BOM, CRLF, LF and Unicode', () => {
 const prefix=Buffer.from([0xef,0xbb,0xbf,...Buffer.from('Outside ☂\r\n<!-- VCP:BEGIN:agents -->\r\n')]);
 const old=Buffer.from('managed\r\n');
 const suffix=Buffer.from('<!-- VCP:END:agents -->\nUser text 🌐\r\n');
 const doc=Buffer.concat([prefix,old,suffix]);
 const regions=parseManagedSections(doc); assert.equal(regions.length,1);
 assert.equal(regions[0].id,'agents');
 const updated=replaceManagedSection(doc,'agents',Buffer.from('new managed\n'));
 assert.deepEqual(updated.subarray(0,prefix.length),prefix);
 assert.deepEqual(updated.subarray(updated.length-suffix.length),suffix);
 assert.equal(updated.subarray(prefix.length,updated.length-suffix.length).toString(),'new managed\n');
});

test('ignore marker-shaped text inside triple fenced Markdown', () => {
 const markdown='~~~md\n<!-- VCP:BEGIN:fake -->\n<!-- VCP:END:fake -->\n~~~\n<!-- VCP:BEGIN:real -->\nabc\n<!-- VCP:END:real -->\n';
 assert.deepEqual(parseManagedSections(markdown).map(x=>x.id),['real']);
});

test('reject orphan, nested, repeated, mismatched and malformed markers', () => {
 const bad=[
  '<!-- VCP:END:one -->\n',
  '<!-- VCP:BEGIN:a -->\n<!-- VCP:BEGIN:b -->\n',
  '<!-- VCP:BEGIN:a -->\n<!-- VCP:END:b -->\n',
  '<!-- VCP:BEGIN:a -->\n<!-- VCP:END:a -->\n<!-- VCP:BEGIN:a -->\n<!-- VCP:END:a -->',
  '<!-- VCP:BEGIN:UPPER -->\n',
  '<!-- VCP:BEGIN:missing -->\n'
 ];
 for(const text of bad)assert.throws(()=>parseManagedSections(text),/Invalid VCP managed Markdown/);
});

test('refuse unknown region and marker injection', () => {
 const doc='<!-- VCP:BEGIN:safe -->\ntext\n<!-- VCP:END:safe -->\n';
 assert.throws(()=>replaceManagedSection(doc,'other','bad'),/UNKNOWN_SECTION/);
 assert.throws(()=>replaceManagedSection(doc,'safe','<!-- VCP:BEGIN:evil -->'),/MARKER_IN_REPLACEMENT/);
 assert.throws(()=>replaceManagedSection(doc,'BAD',''),/INVALID_ID/);
});
