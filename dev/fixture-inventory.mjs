// Phase G: inventory pre-existing temp fixtures WITHOUT deleting them.
// The campaign rule is: never delete anything whose ownership cannot be proven.
// These directories predate this session's owned-fixture markers, so they are
// reported for an owner decision, not removed by the agent.
import { readdir, stat, readFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const T = path.resolve(process.env.TMPDIR || os.tmpdir());
const REAL_TMP = path.resolve(os.tmpdir());
const PATTERN = /^vcp-(neg|wid|wa|controlled|nrc|m2|wb|m3)-|^la10-/;

const scan = async (root, label) => {
  let names;
  try { names = await readdir(root); } catch { return []; }
  const hits = [];
  for (const n of names.filter((x) => PATTERN.test(x))) {
    const full = path.join(root, n);
    const s = await stat(full).catch(() => null);
    let owned = false, fixtureId = null;
    try {
      const m = JSON.parse(await readFile(path.join(full, '.vcp-owned-fixture.json'), 'utf8'));
      owned = m.path === full;
    } catch { /* no marker */ }
    try {
      fixtureId = (JSON.parse(await readFile(path.join(full, '.vcp-controlled-fixture.json'), 'utf8'))).createdAt;
    } catch { /* not a controlled fixture */ }
    hits.push({ name: n, mtime: s?.mtime?.toISOString?.() ?? '?',
      ownedMarker: owned, controlledCreatedAt: fixtureId });
  }
  return { label, root, hits };
};

const sections = [];
for (const root of [REAL_TMP, T]) {
  if (sections.some((s) => s.root === root)) continue;
  sections.push(await scan(root, root === REAL_TMP ? 'os.tmpdir()' : 'TMPDIR override'));
}

const lines = ['=== PHASE G — PRE-EXISTING TEMP FIXTURE INVENTORY (NOT DELETED) ==='];
lines.push(`generated_utc: ${new Date().toISOString()}`);
lines.push(`provenance rule: agent deletes ONLY directories carrying .vcp-owned-fixture.json`);
lines.push(`                 written by this session; everything else is owner-decision.`);
let total = 0, owned = 0;
for (const s of sections) {
  lines.push('', `--- ${s.label}: ${s.root} (${s.hits.length} entries) ---`);
  for (const h of s.hits) {
    total++;
    if (h.ownedMarker) owned++;
    lines.push(`  ${h.name.padEnd(38)} mtime=${h.mtime} owned-marker=${h.ownedMarker}` +
      `${h.controlledCreatedAt ? ` controlled-createdAt=${h.controlledCreatedAt}` : ''}`);
  }
}
lines.push('', `TOTAL inventoried: ${total}   deletable-by-agent (owned marker): ${owned}`);
lines.push(`ACTION TAKEN: none. No directory above was deleted by this scan.`);
const text = lines.join('\n') + '\n';
const { writeFileSync } = await import('node:fs');
writeFileSync('D:/vcp-b9-eng/evidence/33-fixture-inventory.txt', text);
console.log(text.split('\n').slice(0, 6).join('\n'));
console.log(`... ${total} entries total, ${owned} with this-session ownership proof`);
