// ESM loader hook that removes the step-5b post-mutation re-verification from
// lib/production-writer.mjs — IN MEMORY ONLY.
//
// The mutation test needs to prove that the detector FAILS when the gate is
// gone. Patching the working tree would be the wrong way to do that: it
// would dirty the tree, and a failed run could leave the repository with the
// gate removed. The rewrite therefore happens while the module is being
// loaded, and the file on disk is never touched.
//
// The hook is fail-closed in both directions:
//   - the block is found   -> the source is rewritten and a marker file is
//                             written, so the probe can prove the mutation
//                             was really applied;
//   - the block is NOT found -> the source is returned unchanged and no marker
//                             is written, so the probe reports "mutation not
//                             applied" instead of a false kill.
import { writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const TARGET_SUFFIX = '/lib/production-writer.mjs';

// The step-5b block, from its marker comment to the closing brace of the
// `if(testCapability){ ... }` that wraps it.
const STEP5B = /\/\/ 5b\.[\s\S]*?\n {4}\}\n/;

// Same path in the probe process and in this loader thread: the loader runs
// on a worker thread of the same process, so the pid is shared.
export function mutationMarkerPath(pid = process.pid) {
  return path.join(os.tmpdir(), `vcp-post-mutation-mutation-${pid}.applied`);
}

export async function load(url, context, nextLoad) {
  const result = await nextLoad(url, context);
  if (!url.endsWith(TARGET_SUFFIX)) return result;
  const source = Buffer.isBuffer(result.source)
    ? result.source.toString('utf8')
    : String(result.source ?? '');
  if (!STEP5B.test(source)) return result;   // not applied: no marker written
  const mutated = source.replace(
    STEP5B,
    '    // 5b. REMOVED BY THE MUTATION UNDER TEST.\n');
  if (mutated === source || mutated.includes('reverify(')) return result;
  try {
    writeFileSync(mutationMarkerPath(), new Date().toISOString());
  } catch {
    // A missing marker only costs the probe its "applied" proof; it cannot
    // make the mutation look successful.
  }
  return { ...result, source: Buffer.from(mutated, 'utf8'), shortCircuit: true };
}
